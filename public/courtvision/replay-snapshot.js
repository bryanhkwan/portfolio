export function snapshotDimensions(width, height, maximumSide = 4096) {
  if (![width, height, maximumSide].every(Number.isFinite) || width <= 0 || height <= 0 || maximumSide < 1) return null;
  const scale = Math.max(1, Math.ceil(Math.max(1920 / width, 1080 / height)));
  // Integer multiples preserve the exact camera aspect even when a split panel
  // has an odd width. Respect device limits for unusually large/narrow windows.
  if (Math.max(width, height) * scale <= maximumSide) return { width: Math.round(width * scale), height: Math.round(height * scale) };
  const boundedScale = maximumSide / Math.max(width, height);
  return { width: Math.max(1, Math.floor(width * boundedScale)), height: Math.max(1, Math.floor(height * boundedScale)) };
}

export function captureRendererSnapshot(renderer, scene, camera, THREE, createCanvas = () => document.createElement("canvas")) {
  if (!renderer || !scene || !camera) return null;
  const context = renderer.getContext();
  if (context.isContextLost() || !renderer.domElement.width || !renderer.domElement.height) return null;
  const size = renderer.getSize(new THREE.Vector2());
  const maximumSide = Math.min(4096, renderer.capabilities.maxTextureSize, context.getParameter(context.MAX_RENDERBUFFER_SIZE));
  const dimensions = snapshotDimensions(size.x, size.y, maximumSide);
  if (!dimensions) return null;
  const previousTarget = renderer.getRenderTarget();
  const previousFace = renderer.getActiveCubeFace?.() ?? 0;
  const previousMip = renderer.getActiveMipmapLevel?.() ?? 0;
  const viewport = renderer.getViewport(new THREE.Vector4());
  const scissor = renderer.getScissor(new THREE.Vector4());
  const scissorTest = renderer.getScissorTest();
  let target;
  try {
    const { width, height } = dimensions;
    target = new THREE.WebGLRenderTarget(width, height, {
      format: THREE.RGBAFormat, type: THREE.UnsignedByteType,
      depthBuffer: true, stencilBuffer: false, samples: Math.min(4, renderer.capabilities.maxSamples || 0),
    });
    target.texture.colorSpace = renderer.outputColorSpace;
    renderer.setRenderTarget(target);
    renderer.setViewport(0, 0, width, height);
    renderer.setScissorTest(false);
    renderer.render(scene, camera);
    const pixels = new Uint8Array(width * height * 4);
    renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
    const canvas = createCanvas();
    canvas.width = width;
    canvas.height = height;
    const draw = canvas.getContext("2d");
    if (!draw) return null;
    const image = draw.createImageData(width, height);
    const rowBytes = width * 4;
    for (let row = 0; row < height; row += 1) {
      const offset = (height - row - 1) * rowBytes;
      image.data.set(pixels.subarray(offset, offset + rowBytes), row * rowBytes);
    }
    draw.putImageData(image, 0, 0);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  } finally {
    renderer.setRenderTarget(previousTarget, previousFace, previousMip);
    renderer.setViewport(viewport);
    renderer.setScissor(scissor);
    renderer.setScissorTest(scissorTest);
    target?.dispose();
  }
}
