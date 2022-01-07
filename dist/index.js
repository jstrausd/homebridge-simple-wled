"use strict";
const wled_platform_1 = require("./wled-platform");
const settings_1 = require("./settings");
module.exports = (api) => {
    api.registerPlatform(settings_1.PLUGIN_NAME, settings_1.PLATFORM_NAME, wled_platform_1.WLEDPlatform);
};
//# sourceMappingURL=index.js.map