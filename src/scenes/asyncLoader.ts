
export const asyncLoader = (
  loadKey: string,
  loaderPlugin: Phaser.Loader.LoaderPlugin
) => {
  return new Promise<void>((resolve, reject) => {
    loaderPlugin
      .on(
        "filecomplete",
        (key: string, _type: "audio" | "json", _info: any) => {
          if (key === loadKey) {
            // console.log('file complete', key);
            resolve();
          }
        }
      )
      .on("loaderror", (file: Phaser.Loader.FileTypes.ImageFile) => {
        console.log("file rejected", file);
        if (file.key === loadKey) {
          reject();
        }
      });
    loaderPlugin.start();
  });
};
