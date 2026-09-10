// The preload script exposes this bridge on window, and the renderer is compiled by its own tsconfig, so the shape has to live somewhere both programs include.
interface Window {
  electron: {
    invoke: (channel: string, ...args: any[]) => Promise<any>;
    on: (channel: string, callback: (...args: any[]) => void) => () => void;
  };
}
