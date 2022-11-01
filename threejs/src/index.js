import { 
  Mesh, 
  MeshBasicMaterial,
  WebGLRenderer,
  PlaneGeometry,
  TextureLoader
} from 'three';
import { fetchNFT, fetchActiveBanner, sendOnLoadMetric, sendOnClickMetric } from '../../utils/networking';
import { formats } from '../../utils/formats';
import { openURL, parseProtocol } from '../../utils/helpers';
import { version } from '../package.json';

console.log('Zesty SDK Version: ', version);

export default class ZestyBanner extends Mesh {
  /**
   * @constructor
   * @param {string} space The space ID
   * @param {string} network The network to connect to ('rinkeby' or 'polygon')
   * @param {string} format The format of the default banner
   * @param {Number} height Height of the banner
   * @param {WebGLRenderer} renderer Optional field to pass in the WebGLRenderer in a WebXR project
   */
  constructor(space, network, format, style, height, renderer = null, beacon = true) {
    super();
    this.geometry = new PlaneGeometry(formats[format].width * height, height, 1, 1);

    this.type = 'ZestyBanner';
    this.space = space;
    this.network = network;
    this.renderer = renderer;
    this.beacon = beacon;
    this.banner = {};

    this.bannerPromise = loadBanner(space, network, format, style).then(banner => {
      this.material = new MeshBasicMaterial({
        map: banner.texture
      });
      this.material.transparent = true;
      this.banner = banner;

      if (beacon) {
        sendOnLoadMetric(space);
      }
    });
    this.onClick = this.onClick.bind(this);
  }

  onClick() {
    if (this.banner.url) {
      if (this.renderer != null && this.renderer.xr.getSession() != null) {
        this.renderer.xr.getSession().end();
      }

      openURL(this.banner.url);
      if (this.beacon) {
        sendOnClickMetric(this.space);
      }
    }
  }
}

async function loadBanner(space, network, format, style) {
  const activeNFT = await fetchNFT(space, network);
  const activeBanner = await fetchActiveBanner(activeNFT.uri, format, style, space);

  // Need to add https:// if missing for page to open properly
  let url = activeBanner.data.url;
  url = url.match(/^http[s]?:\/\//) ? url : 'https://' + url;
  if (url === 'https://www.zesty.market') {
    url = `https://app.zesty.market/space/${space}`;
  }

  let image = activeBanner.data.image;
  image = image.match(/^.+\.(png|jpe?g)/i) ? image : parseProtocol(image);

  return new Promise((resolve, reject) => {
    const loader = new TextureLoader();

    loader.load(
      image,
      function(texture) {
        resolve({ texture: texture, src: image, uri: activeBanner.uri, url: url });
      },
      undefined,
      function(err) {
        console.error('An error occurred while loading the ad.');
        reject(err);
      }
    );
  });
}

window.ZestyBanner = ZestyBanner;
