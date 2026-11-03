/** The minimal ambient shim for the boundary battery's process.cwd() use. */
declare const process: {
  cwd(): string;
};
