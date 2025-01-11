mergeInto(LibraryManager.library, {
  _beaconSignal: async function (specifiedName, specifiedDescription, specifiedUrl, specifiedImage, specifiedTags) {
    let nameString = UTF8ToString(specifiedName);
    let descriptionString = UTF8ToString(specifiedDescription);
    let urlString = UTF8ToString(specifiedUrl);
    let imageString = UTF8ToString(specifiedImage);
    let tagsString = UTF8ToString(specifiedTags);
    let override = {};
    if (nameString.length > 0) {
      override["name"] = nameString;
    }
    if (descriptionString.length > 0) {
      override["description"] = descriptionString;
    }
    if (urlString.length > 0) {
      override["url"] = urlString;
    }
    if (imageString.length > 0) {
      override["image"] = imageString;
    }
    if (tagsString.length > 0) {
      override["tags"] = tagsString;
    }

    const beacon = new Module['DSIG'].Beacon("http://localhost:8000", override);
    await beacon.signal();
  },
})