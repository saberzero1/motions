import * as path from 'path';

export const config: WebdriverIO.Config = {
    runner: 'local',
    framework: 'mocha',
    specs: ['./test/specs/**/*.e2e.ts'],
    maxInstances: 1,

    capabilities: [
        {
            browserName: 'obsidian',
            browserVersion: 'latest',
            'wdio:obsidianOptions': {
                installerVersion: 'earliest',
                plugins: ['.'],
                vault: 'test-vault',
            },
        },
    ],

    services: ['obsidian'],
    reporters: ['obsidian'],
    cacheDir: path.resolve('.obsidian-cache'),

    mochaOpts: {
        ui: 'bdd',
        timeout: 60000,
    },
    waitforInterval: 250,
    waitforTimeout: 5000,
    logLevel: 'warn',
    injectGlobals: false,
};
