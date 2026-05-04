import {
    type API,
    CharacteristicEventTypes,
    type Logging,
    type PlatformAccessory,
    type CharacteristicValue,
    type CharacteristicGetCallback,
    type CharacteristicSetCallback,
    type Service,
    type HAP
} from 'homebridge';
import {PLUGIN_NAME, PLATFORM_NAME} from './settings';
import {type WLEDPlatform} from './wled-platform';
import {WLEDWebSocket, type WLEDResponse} from './utils/wsUtils';
import {HSVtoRGB, RGBtoHSV} from './utils/colorUtils';

export class WLED {
  private readonly log: Logging;

  private readonly hap: HAP;

  private readonly api: API;

  private readonly platform: WLEDPlatform;

  private readonly Characteristic: any;

  private readonly wledAccessory: PlatformAccessory;

  private readonly name: string;

  private readonly host: string[];

  private readonly lightService: Service;

  private readonly ambilightService!: Service;

  private readonly speedService!: Service;

  private readonly effectsService!: Service;

  private readonly presetsService!: Service;

  /*        LOGGING / DEBUGGING         */
  private readonly debug: boolean = false;

  private readonly prodLogging: boolean = false;

  /*       END LOGGING / DEBUGGING      */

  private readonly multipleHosts: boolean;

  private readonly disableEffectSwitch: boolean;

  private readonly disablePresetSwitch: boolean;

  private readonly turnOffWledWithEffect: boolean;

  private readonly turnOffWledWithPreset: boolean;

  private readonly showEffectControl: boolean;

  private readonly ambilightSwitch: boolean;

  /*  WEBSOCKET CONNECTIONS */
  private readonly websockets: Map<string, WLEDWebSocket> = new Map();

  private primaryWebSocket: WLEDWebSocket | null = null;

  /*  LOCAL CACHING VARIABLES */

  private isOffline = false;

  private lightOn = false;

  private ambilightOn = false;

  private brightness = -1;

  private hue = 100;

  private saturation = 100;

  private colorArray = [255, 0, 0];

  private preset = -1;

  private effectSpeed = 15;

  private effectsAreActive = false;

  private readonly cachedAllEffects: string[] = [];

  private readonly effects: number[] = [];

  private lastPlayedEffect: number = 0;

  private presetsAreActive = false;

  private readonly presets: number[] = [];

  private lastPlayedPreset: number = 0;

  private userInitiatedColorChange = false;

  /*  END LOCAL CACHING VARIABLES */

  private readonly isNewAccessory: boolean;

  constructor(platform: WLEDPlatform, wledConfig: any, loadedEffects: string[]) {
      this.log = platform.log;
      this.name = wledConfig.name || 'WLED';
      this.prodLogging = wledConfig.log || false;
      this.disableEffectSwitch = !(wledConfig.effects);
      this.disablePresetSwitch = !(wledConfig.presets);
      this.turnOffWledWithEffect = wledConfig.turnOffWledWithEffect || false;
      this.turnOffWledWithPreset = wledConfig.turnOffWledWithPreset || false;
      this.effectSpeed = wledConfig.defaultEffectSpeed || 15;
      this.showEffectControl = Boolean(wledConfig.showEffectControl);
      this.ambilightSwitch = Boolean(wledConfig.ambilightSwitch);

      this.cachedAllEffects = loadedEffects;

      if (wledConfig.host instanceof Array && wledConfig.host.length > 1) {
          this.host = wledConfig.host;
          this.multipleHosts = true;
      } else {
          this.host = [wledConfig.host];
          this.multipleHosts = false;
      }

      this.platform = platform;
      this.api = platform.api;
      this.hap = this.api.hap;
      this.Characteristic = this.api.hap.Characteristic;
      const uuid = this.api.hap.uuid.generate('homebridge:wled' + this.name);

      const foundAccessory = this.platform.accessories.find((x: PlatformAccessory) => x.UUID === uuid);
      if (foundAccessory === undefined) {
          // eslint-disable-next-line new-cap
          this.wledAccessory = new this.api.platformAccessory(this.name, uuid);
          this.isNewAccessory = true;
      } else {
          this.wledAccessory = foundAccessory;
          this.isNewAccessory = false;
      }

      this.log.info('Setting up Accessory ' + this.name + ' with Host-IP: ' + this.host + ((this.multipleHosts) ? ' Multiple WLED-Hosts configured' : ' Single WLED-Host configured'));

      this.wledAccessory.category = this.api.hap.Categories.LIGHTBULB;

      this.lightService = this.wledAccessory.getServiceById(this.api.hap.Service.Lightbulb, 'LIGHT')
          || this.wledAccessory.addService(this.api.hap.Service.Lightbulb, this.name, 'LIGHT');

      if (this.showEffectControl) {
          this.speedService = this.wledAccessory.getServiceById(this.api.hap.Service.Lightbulb, 'SPEED')
              || this.wledAccessory.addService(this.api.hap.Service.Lightbulb, 'Effect Speed', 'SPEED');
          this.lightService.addLinkedService(this.speedService);
      }

      if (this.ambilightSwitch) {
          this.ambilightService = this.wledAccessory.getServiceById(this.api.hap.Service.Lightbulb, 'AMBI')
              || this.wledAccessory.addService(this.api.hap.Service.Lightbulb, 'Ambilight', 'AMBI');
          this.lightService.addLinkedService(this.ambilightService);
          this.registerCharacteristicAmbilightOnOff();
      }

      this.registerCharacteristicOnOff();
      this.registerCharacteristicBrightness();
      this.registerCharacteristicSaturation();
      this.registerCharacteristicHue();

      if (!this.disableEffectSwitch) {
      // LOAD ALL EFFECTS FROM HOST
          this.effectsService = this.wledAccessory.getServiceById(this.api.hap.Service.Television, 'Effects') || this.wledAccessory.addService(this.api.hap.Service.Television, 'Effects', 'Effects');
          this.effectsService.setCharacteristic(this.Characteristic.ConfiguredName, 'Effects');

          this.registerCharacteristicEffectsActive();
          this.registerCharacteristicEffectsActiveIdentifier();
          this.addEffectsInputSources(wledConfig.effects);
      }

      if (!this.disablePresetSwitch) {
      // LOAD ALL PRESETS FROM HOST
          this.presetsService = this.wledAccessory.getServiceById(this.api.hap.Service.Television, 'Presets') || this.wledAccessory.addService(this.api.hap.Service.Television, 'Presets', 'Presets');
          this.presetsService.setCharacteristic(this.Characteristic.ConfiguredName, 'Presets');

          this.registerCharacteristicPresetsActive();
          this.registerCharacteristicPresetsActiveIdentifier();
          this.addPresetsInputSources(wledConfig.presets);
      }

      if (this.isNewAccessory) {
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [this.wledAccessory]);
      } else {
          this.api.updatePlatformAccessories([this.wledAccessory]);
      }
      this.log.info('WLED Strip finished initializing!');

      this.connectWebSockets();
  }

  private connectWebSockets(): void {
      try {
          // Connect to primary host first
          const primaryHost = this.host[0];
          if (!primaryHost) {
              this.log.error('No primary host configured for WebSocket connection');
              return;
          }

          this.primaryWebSocket = new WLEDWebSocket(primaryHost);

          this.primaryWebSocket.setOnStateUpdate((data: WLEDResponse) => {
              this.handleStateUpdate(data, primaryHost);
          });

          this.primaryWebSocket.setOnError((error: Error) => {
              this.log.error(`WebSocket error for ${primaryHost}: ${error.message}`);
              this.isOffline = true;
          });

          this.primaryWebSocket.setOnConnect(() => {
              try {
                  this.log.info(`WebSocket connected to ${primaryHost}`);
                  this.isOffline = false;

                  // Request initial state
                  this.primaryWebSocket?.requestState();
              } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  this.log.error(`Error in WebSocket connect callback for ${primaryHost}: ${errorMessage}`);
              }
          });

          this.primaryWebSocket.setOnDisconnect(() => {
              this.log.warn(`WebSocket disconnected from ${primaryHost}`);
              this.isOffline = true;
          });

          this.websockets.set(primaryHost, this.primaryWebSocket);
          this.primaryWebSocket.connect().catch(error => {
              const errorMessage = error instanceof Error ? error.message : String(error);
              this.log.error(`Failed to connect WebSocket to ${primaryHost}: ${errorMessage}`);
          });

          // Connect to additional hosts if multiple hosts configured
          if (this.multipleHosts && this.host.length > 1) {
              for (let i = 1; i < this.host.length; i++) {
                  try {
                      const host = this.host[i];
                      if (host) {
                          const ws = new WLEDWebSocket(host);

                          ws.setOnError((error: Error) => {
                              this.log.error(`WebSocket error for ${host}: ${error.message}`);
                          });

                          ws.setOnConnect(() => {
                              this.log.info(`WebSocket connected to ${host}`);
                          });

                          ws.setOnDisconnect(() => {
                              this.log.warn(`WebSocket disconnected from ${host}`);
                          });

                          this.websockets.set(host, ws);
                          ws.connect().catch(error => {
                              const errorMessage = error instanceof Error ? error.message : String(error);
                              this.log.error(`Failed to connect WebSocket to ${host}: ${errorMessage}`);
                          });
                      }
                  } catch (error) {
                      const errorMessage = error instanceof Error ? error.message : String(error);
                      this.log.error(`Error setting up WebSocket for host at index ${i}: ${errorMessage}`);
                  }
              }
          }
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log.error(`Error in connectWebSockets: ${errorMessage}`);
      }
  }

  private handleStateUpdate(data: WLEDResponse, sourceHost: string): void {
      try {
          const state = data.state;

          // Const info = data.info; // Unused for now

          // Update cached values
          if (state.on !== undefined) {
              this.lightOn = state.on;
          }

          if (state.bri !== undefined && state.bri > 0) {
              this.brightness = state.bri;
          }

          // Update color from first segment
          // Only update if not a user-initiated change to prevent color picker from jumping
          if (!this.userInitiatedColorChange && state.seg && state.seg.length > 0 && state.seg[0].col && state.seg[0].col.length > 0) {
              const colorResponse = state.seg[0].col[0];
              const rgbColor = [colorResponse[0], colorResponse[1], colorResponse[2]];

              if (!this.colorArraysEqual(rgbColor, this.colorArray)) {
                  this.saveColorArrayAsHSV(rgbColor);
                  this.colorArray = rgbColor;
              }
          }

          // Update preset
          if (state.ps !== undefined) {
              this.preset = state.ps;
          }

          // Update ambilight state
          if (state.lor !== undefined) {
              this.ambilightOn = !state.lor;
          }

          // Update effect speed if available
          if (state.seg && state.seg.length > 0 && state.seg[0].sx !== undefined) {
              this.effectSpeed = state.seg[0].sx;
          }

          // Sync to other hosts if multiple hosts configured
          if (this.multipleHosts && sourceHost === this.host[0]) {
              this.syncToOtherHosts(state);
          }

          // Update HomeKit characteristics
          this.updateLight();
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log.error(`Error handling state update from ${sourceHost}: ${errorMessage}`);
      }
  }

  private syncToOtherHosts(state: any): void {
      try {
          // Only sync if this update came from the primary host
          for (let i = 1; i < this.host.length; i++) {
              const host = this.host[i];
              const ws = this.websockets.get(host);
              if (ws && ws.getConnected()) {
                  // Send state update to other hosts
                  ws.send(state);
              }
          }
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log.error(`Error syncing to other hosts: ${errorMessage}`);
      }
  }

  private sendToAllHosts(data: any): void {
      try {
          this.websockets.forEach((ws, host) => {
              try {
                  if (ws.getConnected()) {
                      ws.send(data);
                  } else {
                      this.log.warn(`WebSocket not connected to ${host}, skipping update`);
                  }
              } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  this.log.error(`Error sending to ${host}: ${errorMessage}`);
              }
          });
      } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log.error(`Error in sendToAllHosts: ${errorMessage}`);
      }
  }

  registerCharacteristicOnOff(): void {
      this.lightService.getCharacteristic(this.hap.Characteristic.On)
          .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
              if (this.debug) {
                  this.log('Current state of the switch was returned: ' + (this.lightOn ? 'ON' : 'OFF'));
              }

              callback(undefined, this.lightOn);
          })
          .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
              const tempLightOn = value as boolean;
              if (tempLightOn && !this.lightOn) {
                  this.turnOnWLED();
                  if (this.debug) {
                      this.log('Light was turned on!');
                  }
              } else if (!tempLightOn && this.lightOn) {
                  this.turnOffWLED();
                  if (this.debug) {
                      this.log('Light was turned off!');
                  }
              }

              this.lightOn = tempLightOn;
              callback();
          });
  }

  registerCharacteristicAmbilightOnOff(): void {
      this.ambilightService.getCharacteristic(this.hap.Characteristic.On)
          .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
              if (this.debug) {
                  this.log('Current state of the switch was returned: ' + (this.ambilightOn ? 'ON' : 'OFF'));
              }

              callback(undefined, this.ambilightOn);
          })
          .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
              this.ambilightOn = value as boolean;
              if (this.ambilightOn) {
                  this.turnOnAmbilight();
              } else {
                  this.turnOffAmbilight();
              }

              if (this.debug) {
                  this.log('Switch state was set to: ' + (this.ambilightOn ? 'ON' : 'OFF'));
              }

              callback();
          });
  }

  registerCharacteristicBrightness(): void {
      this.lightService.getCharacteristic(this.hap.Characteristic.Brightness)
          .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
              if (this.debug) {
                  this.log('Current brightness: ' + this.brightness);
              }

              callback(undefined, this.currentBrightnessToPercent());
          })
          .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
              this.brightness = Math.round(255 / 100 * (value as number));
              this.wsSetBrightness();

              if (this.prodLogging) {
                  this.log('Set brightness to ' + value + '% ' + this.brightness);
              }

              callback();
          });

      if (this.showEffectControl) {
      // EFFECT SPEED
          this.speedService.getCharacteristic(this.hap.Characteristic.Brightness)
              .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
                  callback(undefined, Math.round(this.effectSpeed / 2.55));
              }).on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
                  this.effectSpeed = value as number;
                  this.effectSpeed = Math.round(this.effectSpeed * 2.55);
                  if (this.prodLogging) {
                      this.log('Speed set to ' + this.effectSpeed);
                  }

                  this.effectsService.setCharacteristic(this.Characteristic.ActiveIdentifier, this.lastPlayedEffect);

                  callback();
              });
      }
  }

  registerCharacteristicHue(): void {
      this.lightService.getCharacteristic(this.hap.Characteristic.Hue)
          .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
              // eslint-disable-next-line new-cap
              const colorArray = HSVtoRGB(this.hue, this.saturation);
              this.colorArray = colorArray;
              if (this.debug) {
                  this.log('Current hue: ' + this.hue + '%');
              }

              callback(undefined, this.hue);
          })
          .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
              this.userInitiatedColorChange = true;
              this.hue = value as number;
              this.turnOffAllEffects();
              // eslint-disable-next-line new-cap
              const colorArray = HSVtoRGB(this.hue, this.saturation);

              this.sendToAllHosts({
                  bri: this.brightness,
                  seg: [{
                      col: [[colorArray[0], colorArray[1], colorArray[2], 0]]
                  }]
              });

              if (this.prodLogging) {
                  this.log('Changed color to ' + colorArray + ' on all hosts');
              }

              this.colorArray = colorArray;

              // Reset flag after a short delay to allow state update to be processed
              setTimeout(() => {
                  this.userInitiatedColorChange = false;
              }, 500);

              callback();
          });
  }

  registerCharacteristicSaturation(): void {
      this.lightService.getCharacteristic(this.hap.Characteristic.Saturation)
          .on(CharacteristicEventTypes.GET, (callback: CharacteristicGetCallback) => {
              if (this.debug) {
                  this.log('Current saturation: ' + this.saturation + '%');
              }

              callback(undefined, this.saturation);
          })
          .on(CharacteristicEventTypes.SET, (value: CharacteristicValue, callback: CharacteristicSetCallback) => {
              this.userInitiatedColorChange = true;
              this.saturation = value as number;
              this.turnOffAllEffects();

              // Update color with new saturation
              // eslint-disable-next-line new-cap
              const colorArray = HSVtoRGB(this.hue, this.saturation);
              this.sendToAllHosts({
                  bri: this.brightness,
                  seg: [{
                      col: [[colorArray[0], colorArray[1], colorArray[2], 0]]
                  }]
              });
              this.colorArray = colorArray;

              // Reset flag after a short delay to allow state update to be processed
              setTimeout(() => {
                  this.userInitiatedColorChange = false;
              }, 500);

              callback();
          });
  }

  registerCharacteristicEffectsActive(): void {
      this.effectsService.getCharacteristic(this.Characteristic.Active)
          .on(CharacteristicEventTypes.SET, (newValue: any, callback: any) => {
              if (newValue === 0) {
                  if (this.turnOffWledWithEffect) {
                      this.turnOffWLED();
                  } else {
                      this.turnOffAllEffects();
                  }

                  this.effectsAreActive = false;
              } else {
                  if (this.turnOffWledWithEffect) {
                      this.turnOnWLED();
                  }

                  this.effectsAreActive = true;
                  this.effectsService.setCharacteristic(this.Characteristic.ActiveIdentifier, this.lastPlayedEffect);
              }

              this.effectsService.updateCharacteristic(this.Characteristic.Active, newValue);
              callback(null);
          });
  }

  registerCharacteristicEffectsActiveIdentifier(): void {
      this.effectsService.getCharacteristic(this.Characteristic.ActiveIdentifier)
          .on(CharacteristicEventTypes.SET, (newValue: CharacteristicValue, callback: CharacteristicSetCallback) => {
              if (this.effectsAreActive) {
                  const effectID = this.effects[parseInt(newValue.toString(), 10)];
                  this.sendToAllHosts({
                      seg: [{
                          fx: effectID,
                          sx: this.effectSpeed
                      }]
                  });
                  if (this.prodLogging) {
                      this.log('Turned on ' + newValue + ' effect!');
                  }

                  this.lastPlayedEffect = parseInt(newValue.toString(), 10);
              }

              callback(null);
          });
  }

  registerCharacteristicPresetsActive(): void {
      this.presetsService.getCharacteristic(this.Characteristic.Active)
          .on(CharacteristicEventTypes.SET, (newValue: any, callback: any) => {
              if (newValue === 0) {
                  if (this.turnOffWledWithPreset) {
                      this.turnOffWLED();
                  } else {
                      this.turnOffAllPresets();
                  }

                  this.presetsAreActive = false;
              } else {
                  if (this.turnOffWledWithPreset) {
                      this.turnOnWLED();
                  }

                  this.presetsAreActive = true;
                  this.presetsService.setCharacteristic(this.Characteristic.ActiveIdentifier, this.lastPlayedPreset);
              }

              this.presetsService.updateCharacteristic(this.Characteristic.Active, newValue);
              callback(null);
          });
  }

  registerCharacteristicPresetsActiveIdentifier(): void {
      this.presetsService.getCharacteristic(this.Characteristic.ActiveIdentifier)
          .on(CharacteristicEventTypes.SET, (newValue: CharacteristicValue, callback: CharacteristicSetCallback) => {
              if (this.presetsAreActive) {
                  const presetID = this.presets[parseInt(newValue.toString(), 10)];
                  this.sendToAllHosts({
                      ps: presetID + 1
                  });
                  if (this.prodLogging) {
                      this.log('Switched to ' + newValue + ' preset!');
                  }

                  this.lastPlayedPreset = parseInt(newValue.toString(), 10);
              }

              callback(null);
          });
  }

  addEffectsInputSources(effects: any): void {
      if (this.prodLogging) {
          this.log('Adding effects: ' + effects);
      }

      effects.forEach((effectName: string, i: number) => {
          const effectID = this.getEffectIdByName(effectName);
          this.effects.push(effectID);
          const effectInputSource = this.wledAccessory.addService(this.hap.Service.InputSource, String(effectID), effectName);
          effectInputSource
              .setCharacteristic(this.Characteristic.Identifier, i)
              .setCharacteristic(this.Characteristic.ConfiguredName, effectName)
              .setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
              .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.HDMI);
          this.effectsService.addLinkedService(effectInputSource);
      });
  }

  addPresetsInputSources(presets: any): void {
      if (this.prodLogging) {
          this.log('Adding presets: ' + presets);
      }

      presets.forEach((presetName: string, i: number) => {
          const presetID = i;
          this.presets.push(presetID);
          const presetInputSource = this.wledAccessory.addService(this.hap.Service.InputSource, String(presetID), presetName);
          presetInputSource
              .setCharacteristic(this.Characteristic.Identifier, presetID)
              .setCharacteristic(this.Characteristic.ConfiguredName, presetName)
              .setCharacteristic(this.Characteristic.IsConfigured, this.Characteristic.IsConfigured.CONFIGURED)
              .setCharacteristic(this.Characteristic.InputSourceType, this.Characteristic.InputSourceType.HDMI);
          this.presetsService.addLinkedService(presetInputSource);
      });
  }

  wsSetBrightness(): void {
      if (this.brightness === 0) {
          this.turnOffWLED();
          return;
      }

      const colorArray = HSVtoRGB(this.hue, this.saturation); // eslint-disable-line new-cap
      this.colorArray = colorArray;
      if (this.debug) {
          this.log('COLOR ARRAY BRIGHTNESS: ' + colorArray);
      }

      this.sendToAllHosts({
          bri: this.brightness
      });
  }

  turnOffWLED(): void {
      this.sendToAllHosts({
          on: false
      });
      this.lightOn = false;
  }

  turnOnWLED(): void {
      this.sendToAllHosts({
          on: true
      });
      this.lightService.updateCharacteristic(this.hap.Characteristic.Brightness, 100);
      this.lightOn = true;
  }

  turnOffAmbilight(): void {
      this.sendToAllHosts({
          lor: 1
      });
      this.ambilightOn = false;
  }

  turnOnAmbilight(): void {
      this.sendToAllHosts({
          lor: 0
      });
      this.lightService.updateCharacteristic(this.hap.Characteristic.Brightness, 100);
      this.ambilightOn = true;
  }

  turnOffAllEffects(): void {
      const colorArray = HSVtoRGB(this.hue, this.saturation); // eslint-disable-line new-cap
      this.sendToAllHosts({
          seg: [{
              fx: 0,
              sx: 0,
              col: [[colorArray[0], colorArray[1], colorArray[2], 0]]
          }]
      });
      if (!this.disableEffectSwitch) {
          this.effectsService.updateCharacteristic(this.Characteristic.Active, 0);
      }

      if (this.debug) {
          this.log('Turned off Effects!');
      }
  }

  turnOffAllPresets(): void {
      this.sendToAllHosts({
          ps: -1
      });
      if (!this.disableEffectSwitch) {
          this.effectsService.updateCharacteristic(this.Characteristic.Active, 0);
      }

      if (this.debug) {
          this.log('Cleared Presets!');
      }
  }

  getEffectIdByName(name: string): number {
      const allEffects = this.getAllEffects();
      const effectNr = allEffects.indexOf(name);

      if (effectNr >= 0) {
          return effectNr;
      }

      // Effect not found in device's supported effects
      // Log a warning but still try to use it (might be a newer/older version or custom effect)
      this.log.warn(`Effect "${name}" not found in WLED device's supported effects list. ` +
          'This might be a custom effect or from a different WLED version. ' +
          `Available effects: ${allEffects.length > 0 ? allEffects.slice(0, 10).join(', ') + (allEffects.length > 10 ? '...' : '') : 'none loaded'}. ` +
          'Falling back to \'Rainbow Runner\'.');

      // Try to find Rainbow Runner as fallback
      const fallbackIndex = allEffects.indexOf('Rainbow Runner');
      if (fallbackIndex >= 0) {
          return fallbackIndex;
      }

      // If Rainbow Runner is also not available, use first effect or 0
      if (allEffects.length > 0) {
          this.log.warn(`Fallback effect "Rainbow Runner" also not found. Using first available effect: "${allEffects[0]}"`);
          return 0;
      }

      // No effects available at all
      this.log.error('No effects available from WLED device. Cannot set effect.');
      return 0;
  }

  getAllEffects(): string[] {
      return this.cachedAllEffects;
  }

  updateLight(): void {
      this.lightService.updateCharacteristic(this.hap.Characteristic.On, this.lightOn);
      this.lightService.updateCharacteristic(this.hap.Characteristic.Brightness, this.currentBrightnessToPercent());
      this.lightService.updateCharacteristic(this.hap.Characteristic.Saturation, this.saturation);
      this.lightService.updateCharacteristic(this.hap.Characteristic.Hue, this.hue);

      if (this.ambilightService) {
          this.ambilightService.updateCharacteristic(this.hap.Characteristic.On, this.ambilightOn);
      }

      if (this.presetsService) {
          if (this.preset === -1) {
              this.presetsService.updateCharacteristic(this.Characteristic.Active, false);
          } else {
              this.presetsService.updateCharacteristic(this.Characteristic.Active, true);
          }
      }
  }

  currentBrightnessToPercent(): number {
      if (this.brightness <= 0) {
          return 0;
      }

      return Math.round((this.brightness / 255) * 100);
  }

  saveColorArrayAsHSV(colorArray: number[]): void {
      const hsvArray = RGBtoHSV(colorArray[0], colorArray[1], colorArray[2]); // eslint-disable-line new-cap

      // Only update hue and saturation if this is not a user-initiated change
      // This prevents the color picker from "jumping" when low saturation colors are selected
      if (this.userInitiatedColorChange) {
          // If user initiated, only update hue if it's significantly different
          // This allows the saturation to remain as the user set it
          const hueDiff = Math.abs(hsvArray[0] - this.hue);
          if (hueDiff > 10) {
              this.hue = hsvArray[0];
          }

          // Keep the saturation as the user set it, don't update from RGB conversion
      } else {
          this.hue = hsvArray[0];

          // For saturation: only update if the difference is significant (more than 5%)
          // This prevents small rounding errors from causing the color picker to jump
          const saturationDiff = Math.abs(hsvArray[1] - this.saturation);
          if (saturationDiff > 5 || this.saturation === 0 || this.saturation === 100) {
              this.saturation = hsvArray[1];
          }
      }

      // Don't update brightness from color, it's managed separately
  }

  colorArraysEqual(a: number[], b: number[]): boolean {
      if (a.length !== b.length) {
          return false;
      }

      // Allow small differences due to rounding
      // Use larger tolerance for colors with low saturation (pastel colors)
      // as they are more prone to rounding errors
      const isLowSaturation = Math.abs(a[0] - a[1]) < 30 && Math.abs(a[1] - a[2]) < 30 && Math.abs(a[0] - a[2]) < 30;
      const tolerance = isLowSaturation ? 5 : 2;

      return Math.abs(a[0] - b[0]) <= tolerance &&
             Math.abs(a[1] - b[1]) <= tolerance &&
             Math.abs(a[2] - b[2]) <= tolerance;
  }

  disconnect(): void {
      this.websockets.forEach(ws => {
          ws.disconnect();
      });
      this.websockets.clear();
      this.primaryWebSocket = null;
  }
}
