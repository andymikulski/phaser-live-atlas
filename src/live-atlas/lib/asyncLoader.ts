import Phaser from "phaser";

/**
 * Utility function which lets us wait for a resource to be loaded into Phaser.
 *
 * ---
 *
 * Usage:
 * ```ts
 * await loadIntoPhaser(
 *  'your-resource-key',
 *  this.scene.load.image('your-resource-key', 'path-to-your-resource.png')
 * );
 * ```
 *
 * Note you can use `scene.load.audio`, `scene.load.svg`, etc. as needed.
 */
export const loadIntoPhaser = (loadKey: string, loaderPlugin: Phaser.Loader.LoaderPlugin) => {
  return new Promise<void>((resolve, reject) => {
    // Utility function to generate listeners for file lifecycle events
    function makeHandler(callbackFn: VoidFunction) {
      return function (key: string, _type: never, _info: never) {
        if (key === loadKey) {
          setTimeout(()=>{
            removeBindings(); // Ensure nothing else fires for this key
            callbackFn();
          }, 1000);
        }
      };
    }
    // Define handlers used for this specific key
    const completeHandler = makeHandler(resolve);
    const failureHandler = makeHandler(reject);

    // Utility to remove bindings when an event fires
    function removeBindings() {
      loaderPlugin
        .off("filecomplete", completeHandler) // remove success
        .off("loaderror", failureHandler); // remove failure
    }

    // Actually bind handlers
    loaderPlugin
      .on("filecomplete", completeHandler) // Handle success
      .on("loaderror", failureHandler); // Handle failure

    // Loaders don't start outside of `preload` unless explicitly triggered
    loaderPlugin.start();
  });
};
