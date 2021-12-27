import {API} from 'homebridge';
import {WLEDPlatform} from './wled-platform';
import {PLUGIN_NAME, PLATFORM_NAME} from "./settings";


export = (api: API) => {
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, WLEDPlatform);
};