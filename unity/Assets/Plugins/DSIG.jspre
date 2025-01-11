Module['DSIG'] = Module['DSIG'] || {};

/**
 * sig-beacon v0.11
 */
Module['DSIG'].Beacon = class Beacon {
  /** @type {string} The relay URL that this beacon will connect to */
  relay;
  /** @type {string} The name of the app, if specified. Overrides page checks. */
  specifiedName;
  /** @type {string} The description of the app, if specified. Overrides page checks. */
  specifiedDescription;
  /** @type {string} The canonical URL of the app, if specified. Overrides page checks. */
  specifiedUrl;
  /** @type {string} The preview image of the app, if specified. Overrides page checks. */
  specifiedImage;
  /** @type {string} The tags for the app, if specified. Overrides page checks. */
  specifiedTags;
  /** @type {boolean} Whether the beacon is currently in a browser context */
  browserContext = 'document' in globalThis;
  /** @type {Document} The top-level HTML document, if we detect we are running in an iframe. */
  topLevelDocument = null;

  /**
   *
   * @param {string} relay The relay URL that this beacon will connect to
   * @param {{ name?: string, description?: string }} override Manual overrides for name and description. Will be passed directly to the relay when signalling.
   * @returns {Beacon}
   */
  constructor(relay, override = null) {
    if (!this.browserContext) {
      console.error("This beacon can only be used in a browser context!");
      return;
    }
    if (!relay) {
      console.error("You must specify a relay URL for the beacon to connect to!");
      return;
    }
    this.relay = relay;
    if (override) {
      this.specifiedName = override.name ?? null;
      this.specifiedDescription = override.description ?? null;
      this.specifiedUrl = override.url ?? null;
      this.specifiedImage = override.image ?? null;
      this.specifiedTags = override.tags ?? null;
    }
  }

  /**
   * Retrieves the canonical URL from meta tag if specified, otherwise the current document URL
   * @returns {string}
   */
  getUrl() {
    if (this.specifiedUrl) return this.specifiedUrl;

    const document = this.topLevelDocument ?? window.document;
    const og = document.head.querySelector('meta[property="og:url"]');
    const meta = document.head.querySelector('meta[data-canonical-url]');
    if (og) {
      return og.getAttribute('content');
    } else if (meta) {
      return meta.getAttribute('data-canonical-url');
    } else {
      return this.topLevelDocument ? window.top.location.href : window.document.location.href;
    }
  }

  /**
   * Retrieves app name from meta tag, returning document title if not found
   * @returns {string}
   */
  getName() {
    if (this.specifiedName) return this.specifiedName;

    const document = this.topLevelDocument ?? window.document;
    const meta = document.head.querySelector('meta[name="application-name"]');
    if (meta) {
      return meta.getAttribute('content');
    } else {
      return document.title;
    }
  }

  /**
   * Retrieves app description from meta tag, returning empty string if not found
   * @returns {string}
   */
  getDescription() {
    if (this.specifiedDescription) return this.specifiedDescription;

    const document = this.topLevelDocument ?? window.document;
    const meta = document.head.querySelector('meta[name="description"]');
    const og = document.head.querySelector('meta[property="og:description"]');
    if (meta && meta.hasAttribute('description')) {
      // This is technically incorrect but there are instances of this in the wild,
      // so check for this first.
      return meta.getAttribute('description');
    } else if (meta) {
      return meta.getAttribute('content');
    } else if (og) {
      return og.getAttribute('content');
    } else {
      return "";
    }
  }

  /**
   * Retrieves an image relevant to the page content, either from the OpenGraph image
   * or a snapshot of the canvas on initial page load.
   * @returns {Promise<string>}
   */
  async getImage() {
    if (this.specifiedImage) return this.specifiedImage;

    const document = this.topLevelDocument ?? window.document;
    const meta = document.head.querySelector('meta[property="og:image"]');

    // Give enough time for page+canvas contents to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    const aframeFallback = document.querySelector('a-scene')?.components.screenshot;

    if (meta) {
      let content = meta.getAttribute('content');
      if (content.length === 0) {
        // Content attribute is blank for some reason
        return "#";
      } else if (content.startsWith("http")) {
        // Content is an absolute URL, pass on as is
        return content;
      } else {
        // Content is a relative URL, concatenate with current URL
        return new URL(content, this.getUrl()).href;
      }
    } else if (aframeFallback) {
      // A-Frame inserts a component by default that allows you to save the current scene
      // in an equirectangular or perspective screenshot. We use perspective here for less warping
      // and reduce the dimensions, as it defaults to 4096 x 2048
      const aScene = document.querySelector('a-scene');
      let oldWidth = aframeFallback.width;
      let oldHeight = aframeFallback.height;
      aScene.setAttribute("screenshot", "width: 2048; height: 1024;");
      const canvas = aframeFallback.getCanvas('perspective');
      const dataURL = canvas.toDataURL();
      // Restore initial values for screenshot after image is taken
      aScene.setAttribute("screenshot", `width: ${oldWidth}; height: ${oldHeight};`);
      return dataURL;
    } else {
      // TODO: Find other ways of getting a fallback screenshot
      // HTMLCanvasElement.toDataURL() does not work cleanly with WebGL contexts due to the default rendering
      // behavior, so it cannot be relied on solely as a fallback.
      return "#";
    }
  }

  /**
   * Checks whether this page contains adult content.
   * @returns {boolean}
   */
  isAdult() {
    const document = this.topLevelDocument ?? window.document;
    const meta = document.head.querySelector('meta[name="rating"]');
    if (meta) {
      const meta1 = meta.getAttribute('content') === 'adult';
      // Comes from https://www.rtalabel.org/?content=howto
      const meta2 = meta.getAttribute('content') === 'RTA-5042-1996-1400-1577-RTA';
      return meta1 || meta2;
    }

    // At this point, ideally the website has accurately indicated its content rating.
    // If not, it will need to be filtered manually on the relay side.
    return false;
  }

  /**
   * Retrieves any specified keywords for the page, which in turn will assist with filtering
   * on the relay side.
   * @returns {string}
   */
  getTags() {
    if (this.specifiedTags) return this.specifiedTags;

    const document = this.topLevelDocument ?? window.document;
    const meta = document.head.querySelector('meta[name="keywords"]');
    if (meta) {
      return meta.getAttribute('content');
    } else {
      return "";
    }
  }

  /**
   * Sends a signal to the relay with the app's current metadata
   * @returns {Promise<void>}
   */
  async signal() {
    if (!this.browserContext) {
      console.error("This beacon can only be used in a browser context!");
      return;
    }
    if (!this.relay) {
      console.error("You must specify a relay URL for the beacon to connect to!");
      return;
    }
    if (document.readyState !== 'complete') {
      await new Promise(resolve => document.addEventListener('DOMContentLoaded', resolve));
    }
    // Check if we are running in an iframe. If so, try to get the top-level document.
    // Unfortunately, this will only work if the frames are same-origin.
    if (window.self !== window.top) {
      try {
        this.topLevelDocument = window.top.document;
      } catch {
        console.error("Cannot get URL of cross-origin frame, aborting.");
        return;
      }
    }
    const url = this.getUrl();
    const name = this.getName();
    const description = this.getDescription();
    const image = await this.getImage();
    const adult = this.isAdult();
    const tags = this.getTags();
    if (!url || !name || !description || !image) {
      console.error("Missing required metadata! Check your <meta> tags for the following attributes: data-canonical-url, name=application-name, name=description, og:image");
      return;
    }
    const payload = {
      url,
      name,
      description,
      active: true,
      image,
      adult,
      tags,
    };
    await fetch(`${this.relay}/beacon`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}