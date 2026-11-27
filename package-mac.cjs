const path = require('node:path');

(async () => {
  const { packager } = await import('@electron/packager');
  const results = await packager({
    dir: __dirname,
    name: 'TableKeep',
    platform: 'darwin',
    arch: 'arm64',
    out: path.resolve(__dirname, '../TableKeep-build'),
    electronVersion: require('electron/package.json').version,
    ...(process.env.TABLEKEEP_ELECTRON_ZIP_DIR ? { electronZipDir: process.env.TABLEKEEP_ELECTRON_ZIP_DIR } : {}),
    icon: path.join(__dirname, 'assets/icon.icns'),
    appBundleId: 'io.github.liushuai-beep.tablekeep',
    appVersion: require('./package.json').version,
    overwrite: true,
    prune: true,
    ignore: [/^\/(?:node_modules|tests|scripts|docs|\.github|\.git)(?:\/|$)/],
    extendInfo: { LSUIElement: true },
    osxSign: {
      identity: '-',
      identityValidation: false,
      preAutoEntitlements: false,
      optionsForFile: () => ({ hardenedRuntime: false }),
      continueOnError: false,
    },
  });
  console.log(results.join('\n'));
})().catch(error => { console.error(error); process.exitCode = 1; });
