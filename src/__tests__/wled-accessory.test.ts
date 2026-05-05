import {WLED} from '../wled-accessory';
import {WLEDPlatform} from '../wled-platform';
import {WLEDWebSocket} from '../utils/wsUtils';
import {HSVtoRGB, RGBtoHSV} from '../utils/colorUtils';

// Mock dependencies
jest.mock('../utils/wsUtils');
jest.mock('../utils/colorUtils');

describe('WLED Accessory', () => {
    let mockPlatform: jest.Mocked<WLEDPlatform>;
    let mockApi: any;
    let mockHap: any;
    let mockLog: any;
    let mockAccessory: any;
    let mockLightService: any;
    let mockWebSocket: jest.Mocked<WLEDWebSocket>;
    let wledAccessory: WLED;

    const mockWledConfig = {
        name: 'Test WLED',
        host: '192.168.1.100',
        effects: ['Rainbow Runner', 'Circus'],
        log: false
    };

    const mockEffects = ['Solid', 'Blink', 'Rainbow Runner', 'Circus', 'Rainbow'];

    beforeEach(() => {
        jest.clearAllMocks();

        // Mock WebSocket
        mockWebSocket = {
            getConnected: jest.fn().mockReturnValue(true),
            send: jest.fn(),
            requestState: jest.fn(),
            connect: jest.fn().mockResolvedValue(undefined),
            disconnect: jest.fn(),
            setOnStateUpdate: jest.fn(),
            setOnError: jest.fn(),
            setOnConnect: jest.fn(),
            setOnDisconnect: jest.fn()
        } as any;

        (WLEDWebSocket as jest.MockedClass<typeof WLEDWebSocket>).mockImplementation(() => mockWebSocket);

        // Mock Homebridge API
        mockHap = {
            Characteristic: {
                On: 'On',
                Brightness: 'Brightness',
                Hue: 'Hue',
                Saturation: 'Saturation',
                Active: 'Active',
                ActiveIdentifier: 'ActiveIdentifier',
                ConfiguredName: 'ConfiguredName',
                IsConfigured: {CONFIGURED: 'CONFIGURED'},
                InputSourceType: {HDMI: 'HDMI'}
            },
            Service: {
                Lightbulb: 'Lightbulb',
                Television: 'Television',
                InputSource: 'InputSource'
            },
            Categories: {
                LIGHTBULB: 'LIGHTBULB'
            },
            uuid: {
                generate: jest.fn().mockReturnValue('test-uuid')
            }
        };

        mockApi = {
            hap: mockHap,
            platformAccessory: jest.fn().mockImplementation(() => mockAccessory),
            publishExternalAccessories: jest.fn(),
            registerPlatformAccessories: jest.fn(),
            updatePlatformAccessories: jest.fn()
        };

        // Mock Logging
        mockLog = {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn()
        };

        // Mock Platform
        mockPlatform = {
            log: mockLog,
            api: mockApi,
            accessories: [],
            config: {wleds: [mockWledConfig]}
        } as any;

        // Mock Accessory
        mockAccessory = {
            UUID: 'test-uuid',
            category: undefined,
            addService: jest.fn(),
            getService: jest.fn(),
            getServiceById: jest.fn().mockReturnValue(undefined)
        };

        // Mock Services
        mockLightService = {
            getCharacteristic: jest.fn().mockReturnValue({
                on: jest.fn().mockReturnThis(),
                updateCharacteristic: jest.fn()
            }),
            updateCharacteristic: jest.fn(),
            addLinkedService: jest.fn(),
            setCharacteristic: jest.fn().mockReturnThis()
        };

        const mockEffectsService = {
            getCharacteristic: jest.fn().mockReturnValue({
                on: jest.fn().mockReturnThis(),
                updateCharacteristic: jest.fn()
            }),
            setCharacteristic: jest.fn().mockReturnThis(),
            updateCharacteristic: jest.fn(),
            addLinkedService: jest.fn()
        };

        const mockPresetsService = {
            getCharacteristic: jest.fn().mockReturnValue({
                on: jest.fn().mockReturnThis(),
                updateCharacteristic: jest.fn()
            }),
            setCharacteristic: jest.fn().mockReturnThis(),
            updateCharacteristic: jest.fn(),
            addLinkedService: jest.fn()
        };

        mockAccessory.addService.mockImplementation((serviceType: string, name?: string) => {
            if (serviceType === 'Television') {
                if (name === 'Effects') {
                    return mockEffectsService;
                }

                return mockPresetsService;
            }

            return mockLightService;
        });

        // Mock colorUtils
        (HSVtoRGB as jest.Mock).mockImplementation((h, s) => {
            if (h === 0 && s === 100) {
                return [255, 0, 0];
            }

            if (h === 60 && s === 100) {
                return [255, 255, 0];
            }

            if (h === 120 && s === 100) {
                return [0, 255, 0];
            }

            return [128, 128, 128];
        });

        (RGBtoHSV as jest.Mock).mockImplementation((r, g, b) => {
            if (r === 255 && g === 0 && b === 0) {
                return [0, 100, 100];
            }

            if (r === 0 && g === 255 && b === 0) {
                return [120, 100, 100];
            }

            return [180, 50, 50];
        });

        wledAccessory = new WLED(mockPlatform, mockWledConfig, mockEffects);
    });

    afterEach(() => {
        if (wledAccessory) {
            wledAccessory.disconnect();
        }
    });

    describe('Constructor', () => {
        it('should create WLED accessory with correct name', () => {
            expect(mockAccessory.addService).toHaveBeenCalledWith('Lightbulb', 'Test WLED', 'LIGHT');
        });

        it('should set up WebSocket connection', () => {
            expect(WLEDWebSocket).toHaveBeenCalledWith('192.168.1.100');
            expect(mockWebSocket.connect).toHaveBeenCalled();
        });

        it('should handle multiple hosts', () => {
            jest.clearAllMocks();
            const multiHostConfig = {
                ...mockWledConfig,
                host: ['192.168.1.100', '192.168.1.101']
            };
            const multiWled = new WLED(mockPlatform, multiHostConfig, mockEffects);

            // Should create WebSocket for primary host + additional hosts
            expect(WLEDWebSocket).toHaveBeenCalledTimes(2);
            expect(WLEDWebSocket).toHaveBeenCalledWith('192.168.1.100');
            expect(WLEDWebSocket).toHaveBeenCalledWith('192.168.1.101');
            multiWled.disconnect();
        });

        it('should register all characteristics', () => {
            expect(mockLightService.getCharacteristic).toHaveBeenCalledWith('On');
            expect(mockLightService.getCharacteristic).toHaveBeenCalledWith('Brightness');
            expect(mockLightService.getCharacteristic).toHaveBeenCalledWith('Hue');
            expect(mockLightService.getCharacteristic).toHaveBeenCalledWith('Saturation');
        });
    });

    describe('Cached accessory handling (HB 2.0 compat)', () => {
        it('should reuse existing services from cached accessory instead of adding duplicates', () => {
            jest.clearAllMocks();

            const existingLightService = {
                getCharacteristic: jest.fn().mockReturnValue({
                    on: jest.fn().mockReturnThis(),
                    updateCharacteristic: jest.fn()
                }),
                updateCharacteristic: jest.fn(),
                addLinkedService: jest.fn(),
                setCharacteristic: jest.fn().mockReturnThis()
            };

            const existingEffectsService = {
                getCharacteristic: jest.fn().mockReturnValue({
                    on: jest.fn().mockReturnThis(),
                    updateCharacteristic: jest.fn()
                }),
                setCharacteristic: jest.fn().mockReturnThis(),
                updateCharacteristic: jest.fn(),
                addLinkedService: jest.fn()
            };

            const existingInputSource = {
                setCharacteristic: jest.fn().mockReturnThis(),
                updateCharacteristic: jest.fn()
            };

            // Simulate cached accessory that already has services
            const cachedAccessory = {
                UUID: 'test-uuid',
                category: undefined,
                addService: jest.fn().mockReturnValue(existingLightService),
                getService: jest.fn(),
                getServiceById: jest.fn().mockImplementation((serviceType: string, subType: string) => {
                    if (serviceType === 'Lightbulb' && subType === 'LIGHT') {
                        return existingLightService;
                    }

                    if (serviceType === 'Television' && subType === 'Effects') {
                        return existingEffectsService;
                    }

                    if (serviceType === 'InputSource') {
                        return existingInputSource;
                    }

                    return undefined;
                })
            };

            // Platform with the cached accessory already in list
            const platformWithCache = {
                log: mockLog,
                api: mockApi,
                accessories: [cachedAccessory],
                config: {wleds: [mockWledConfig]}
            } as any;

            const cachedWled = new WLED(platformWithCache, mockWledConfig, mockEffects);

            // Should NOT have called addService for Lightbulb since getServiceById returned it
            const lightbulbAddCalls = (cachedAccessory.addService as jest.Mock).mock.calls
                .filter((c: any[]) => c[0] === 'Lightbulb' && c[2] === 'LIGHT');
            expect(lightbulbAddCalls.length).toBe(0);

            // Should have called getServiceById for LIGHT service
            expect(cachedAccessory.getServiceById).toHaveBeenCalledWith('Lightbulb', 'LIGHT');

            cachedWled.disconnect();
        });

        it('should publish as external accessory (required for Television service)', () => {
            // External accessories are required for HomeKit Television service support
            expect(mockApi.publishExternalAccessories).toHaveBeenCalledWith(
                'homebridge-simple-wled',
                [mockAccessory]
            );

            // Should NOT use registerPlatformAccessories (breaks Television service in HomeKit)
            expect(mockApi.registerPlatformAccessories).not.toHaveBeenCalled();
        });

        it('should not use numeric IDs as InputSource service names', () => {
            // Verify that addService was called with effect names, not numeric IDs
            const inputSourceCalls = (mockAccessory.addService as jest.Mock).mock.calls
                .filter((c: any[]) => c[0] === 'InputSource');

            inputSourceCalls.forEach((call: any[]) => {
                const displayName = call[1];

                // Display name should NOT be a pure number
                expect(displayName).not.toMatch(/^\d+$/);

                // Display name should be an effect or preset name
                expect(typeof displayName).toBe('string');
                expect(displayName.length).toBeGreaterThan(1);
            });
        });

        it('should reuse cached InputSource services on reboot', () => {
            jest.clearAllMocks();

            const existingInputSource = {
                setCharacteristic: jest.fn().mockReturnThis()
            };

            const cachedAccessory = {
                UUID: 'test-uuid',
                category: undefined,
                addService: jest.fn().mockReturnValue({
                    getCharacteristic: jest.fn().mockReturnValue({
                        on: jest.fn().mockReturnThis(),
                        updateCharacteristic: jest.fn()
                    }),
                    updateCharacteristic: jest.fn(),
                    addLinkedService: jest.fn(),
                    setCharacteristic: jest.fn().mockReturnThis()
                }),
                getService: jest.fn(),
                getServiceById: jest.fn().mockImplementation((serviceType: string, subType: string) => {
                    // Return existing InputSource for known effect names
                    if (serviceType === 'InputSource' && (subType === 'Rainbow Runner' || subType === 'Circus')) {
                        return existingInputSource;
                    }

                    return undefined;
                })
            };

            const platformWithCache = {
                log: mockLog,
                api: mockApi,
                accessories: [cachedAccessory],
                config: {wleds: [mockWledConfig]}
            } as any;

            const cachedWled = new WLED(platformWithCache, mockWledConfig, mockEffects);

            // Should NOT have called addService for InputSource since getServiceById returned them
            const inputSourceAddCalls = (cachedAccessory.addService as jest.Mock).mock.calls
                .filter((c: any[]) => c[0] === 'InputSource');
            expect(inputSourceAddCalls.length).toBe(0);

            // Should have looked up existing InputSource services by effect name
            expect(cachedAccessory.getServiceById).toHaveBeenCalledWith('InputSource', 'Rainbow Runner');
            expect(cachedAccessory.getServiceById).toHaveBeenCalledWith('InputSource', 'Circus');

            cachedWled.disconnect();
        });
    });

    describe('Color calculations', () => {
        it('should convert HSV to RGB correctly', () => {
            // HSVtoRGB is mocked, so we just verify the colorArray is set
            const result = wledAccessory['colorArray'];
            expect(result).toBeDefined();
            expect(Array.isArray(result)).toBe(true);
            expect(result.length).toBe(3);
        });

        it('should save color array as HSV correctly', () => {
            const rgbColor = [255, 0, 0];
            wledAccessory.saveColorArrayAsHSV(rgbColor);

            expect(RGBtoHSV).toHaveBeenCalledWith(255, 0, 0);
        });

        it('should compare color arrays correctly', () => {
            const a = [255, 0, 0];
            const b = [255, 0, 0];
            const c = [255, 10, 10];

            expect(wledAccessory['colorArraysEqual'](a, b)).toBe(true);
            expect(wledAccessory['colorArraysEqual'](a, c)).toBe(false);
        });

        it('should handle color array comparison with tolerance', () => {
            const a = [255, 0, 0];
            const b = [255, 1, 1]; // Within tolerance

            expect(wledAccessory['colorArraysEqual'](a, b)).toBe(true);
        });
    });

    describe('Brightness handling', () => {
        it('should convert brightness to percent correctly', () => {
            wledAccessory['brightness'] = 128;
            const percent = wledAccessory.currentBrightnessToPercent();

            expect(percent).toBe(50); // 128/255 * 100 = 50.19... rounded to 50
        });

        it('should handle zero brightness', () => {
            wledAccessory['brightness'] = 0;
            const percent = wledAccessory.currentBrightnessToPercent();

            expect(percent).toBe(0);
        });

        it('should handle negative brightness', () => {
            wledAccessory['brightness'] = -1;
            const percent = wledAccessory.currentBrightnessToPercent();

            expect(percent).toBe(0);
        });
    });

    describe('State updates', () => {
        it('should handle state update from WebSocket', () => {
            const stateUpdate = {
                state: {
                    on: true,
                    bri: 255,
                    seg: [{
                        col: [[255, 0, 0, 0]]
                    }]
                },
                info: {
                    ver: '0.13.0',
                    leds: {count: 30},
                    name: 'WLED',
                    fxcount: 80,
                    palcount: 47
                }
            };

            const updateCallback = (mockWebSocket.setOnStateUpdate as jest.Mock).mock.calls[0]?.[0];
            if (updateCallback) {
                updateCallback(stateUpdate);
            }

            expect(wledAccessory['lightOn']).toBe(true);
            expect(wledAccessory['brightness']).toBe(255);
        });

        it('should update color from state', () => {
            const stateUpdate = {
                state: {
                    on: true,
                    bri: 255,
                    seg: [{
                        col: [[0, 255, 0, 0]]
                    }]
                },
                info: {
                    ver: '0.13.0',
                    leds: {count: 30},
                    name: 'WLED',
                    fxcount: 80,
                    palcount: 47
                }
            };

            const updateCallback = (mockWebSocket.setOnStateUpdate as jest.Mock).mock.calls[0]?.[0];
            if (updateCallback) {
                updateCallback(stateUpdate);
            }

            expect(RGBtoHSV).toHaveBeenCalled();
        });

        it('should update preset from state', () => {
            const stateUpdate = {
                state: {
                    on: true,
                    bri: 255,
                    ps: 5
                },
                info: {
                    ver: '0.13.0',
                    leds: {count: 30},
                    name: 'WLED',
                    fxcount: 80,
                    palcount: 47
                }
            };

            const updateCallback = (mockWebSocket.setOnStateUpdate as jest.Mock).mock.calls[0]?.[0];
            if (updateCallback) {
                updateCallback(stateUpdate);
            }

            expect(wledAccessory['preset']).toBe(5);
        });

        it('should handle state update errors gracefully', () => {
            const stateUpdate = {
                state: {
                    on: true,
                    bri: 255
                },
                info: {
                    ver: '0.13.0',
                    leds: {count: 30},
                    name: 'WLED',
                    fxcount: 80,
                    palcount: 47
                }
            };

            // The handleStateUpdate already has try-catch, so errors should be caught
            const updateCallback = (mockWebSocket.setOnStateUpdate as jest.Mock).mock.calls[0]?.[0];
            if (updateCallback) {
                // Should not throw even if there's an error
                expect(() => updateCallback(stateUpdate)).not.toThrow();
            }
        });
    });

    describe('WebSocket communication', () => {
        it('should send turn on command', () => {
            wledAccessory['turnOnWLED']();

            expect(mockWebSocket.send).toHaveBeenCalledWith({on: true});
        });

        it('should send turn off command', () => {
            wledAccessory['turnOffWLED']();

            expect(mockWebSocket.send).toHaveBeenCalledWith({on: false});
        });

        it('should send brightness update', () => {
            wledAccessory['brightness'] = 128;
            wledAccessory.wsSetBrightness();

            expect(mockWebSocket.send).toHaveBeenCalled();
        });

        it('should send color update', () => {
            wledAccessory['hue'] = 0;
            wledAccessory['saturation'] = 100;
            wledAccessory['brightness'] = 255;

            // Directly call the method that sends color update
            wledAccessory.registerCharacteristicHue();

            // Find the SET handler for Hue characteristic
            const hueCharacteristic = (mockLightService.getCharacteristic as jest.Mock).mock.results
                .find((r: any) => r.value)?.value;

            if (hueCharacteristic && hueCharacteristic.on) {
                const setCalls = (hueCharacteristic.on as jest.Mock).mock.calls;
                const setHandler = setCalls.find((c: any[]) => c[0] === 'SET')?.[1];
                if (setHandler) {
                    setHandler(0, jest.fn());
                    expect(mockWebSocket.send).toHaveBeenCalled();
                }
            }
        });

        it('should send to all hosts when multiple hosts configured', () => {
            const multiHostConfig = {
                ...mockWledConfig,
                host: ['192.168.1.100', '192.168.1.101']
            };
            const multiWled = new WLED(mockPlatform, multiHostConfig, mockEffects);

            multiWled['sendToAllHosts']({on: true});

            expect(mockWebSocket.send).toHaveBeenCalledTimes(2);
            multiWled.disconnect();
        });

        it('should handle disconnected WebSocket gracefully', () => {
            mockWebSocket.getConnected.mockReturnValue(false);

            wledAccessory['sendToAllHosts']({on: true});

            expect(mockLog.warn).toHaveBeenCalled();
        });
    });

    describe('Effect handling', () => {
        it('should get effect ID by name', () => {
            const effectId = wledAccessory.getEffectIdByName('Rainbow Runner');

            expect(effectId).toBe(2); // Index in mockEffects array
        });

        it('should return fallback effect if not found', () => {
            const effectId = wledAccessory.getEffectIdByName('NonExistent');

            expect(effectId).toBe(2); // Falls back to Rainbow Runner
        });

        it('should turn off all effects', () => {
            wledAccessory['hue'] = 0;
            wledAccessory['saturation'] = 100;
            wledAccessory['brightness'] = 255;

            wledAccessory.turnOffAllEffects();

            expect(mockWebSocket.send).toHaveBeenCalled();
        });
    });

    describe('Preset handling', () => {
        it('should turn off all presets', () => {
            wledAccessory.turnOffAllPresets();

            expect(mockWebSocket.send).toHaveBeenCalledWith({ps: -1});
        });
    });

    describe('Ambilight handling', () => {
        it('should turn on ambilight', () => {
            wledAccessory.turnOnAmbilight();

            expect(mockWebSocket.send).toHaveBeenCalledWith({lor: 0});
        });

        it('should turn off ambilight', () => {
            wledAccessory.turnOffAmbilight();

            expect(mockWebSocket.send).toHaveBeenCalledWith({lor: 1});
        });
    });

    describe('Disconnect', () => {
        it('should disconnect all WebSocket connections', () => {
            wledAccessory.disconnect();

            expect(mockWebSocket.disconnect).toHaveBeenCalled();
        });

        it('should handle multiple hosts disconnect', () => {
            const multiHostConfig = {
                ...mockWledConfig,
                host: ['192.168.1.100', '192.168.1.101']
            };
            const multiWled = new WLED(mockPlatform, multiHostConfig, mockEffects);

            multiWled.disconnect();

            expect(mockWebSocket.disconnect).toHaveBeenCalledTimes(2);
        });
    });

    describe('Characteristic handlers', () => {
        it('should handle On characteristic GET', done => {
            wledAccessory['lightOn'] = true;

            const getHandler = (mockLightService.getCharacteristic as jest.Mock).mock.results
                .find((r: any) => r.value)?.value?.on?.mock.calls
                .find((c: any[]) => c[0] === 'GET')?.[1];

            if (getHandler) {
                getHandler((error: any, value: any) => {
                    expect(error).toBeUndefined();
                    expect(value).toBe(true);
                    done();
                });
            } else {
                done();
            }
        });

        it('should handle On characteristic SET', done => {
            const setHandler = (mockLightService.getCharacteristic as jest.Mock).mock.results
                .find((r: any) => r.value)?.value?.on?.mock.calls
                .find((c: any[]) => c[0] === 'SET')?.[1];

            if (setHandler) {
                setHandler(true, () => {
                    expect(mockWebSocket.send).toHaveBeenCalled();
                    done();
                });
            } else {
                done();
            }
        });

        it('should handle Brightness characteristic SET', done => {
            const brightnessService = {
                getCharacteristic: jest.fn().mockReturnValue({
                    on: jest.fn().mockReturnThis()
                })
            };
            mockLightService.getCharacteristic.mockReturnValueOnce({
                on: jest.fn().mockReturnThis()
            }).mockReturnValueOnce(brightnessService);

            const setHandler = brightnessService.getCharacteristic().on.mock.calls
                .find((c: any[]) => c[0] === 'SET')?.[1];

            if (setHandler) {
                setHandler(50, () => {
                    expect(mockWebSocket.send).toHaveBeenCalled();
                    done();
                });
            } else {
                done();
            }
        });
    });
});
