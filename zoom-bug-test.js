const { chromium } = require('playwright');

async function testZoomBugs() {
  console.log('🚀 Starting Playwright test for zoom bugs...\n');

  const browser = await chromium.launch({ headless: false, slowMo: 100 });
  const context = await browser.newContext({
    recordVideo: {
      dir: './test-videos/',
      size: { width: 1280, height: 720 }
    }
  });
  const page = await context.newPage();

  // Track zoom changes
  let zoomChanges = [];

  // Listen for console logs to capture zoom changes
  page.on('console', msg => {
    const text = msg.text();

    // Capture zoom-related logs
    if (text.includes('🔍 ViewportManager.zoomAt') ||
        text.includes('🔍 ViewportManager.zoomTo') ||
        text.includes('updateViewport') ||
        text.includes('📍 Pan changed') ||
        text.includes('currentZoom:') ||
        text.includes('🔍 DiagramCanvas') ||
        text.includes('🔧 ViewportManager') ||
        text.includes('🔔 ViewportManager') ||
        text.includes('🎯 DiagramEngine') ||
        text.includes('⚠️ ViewportManager') ||
        text.includes('✅ ViewportManager') ||
        text.includes('❌ ViewportManager') ||
        text.includes('📡 viewport changed')) {
      console.log(`📝 ${text}`);

      // Extract zoom values
      const zoomMatch = text.match(/currentZoom:\s*([0-9.]+)/);
      if (zoomMatch) {
        zoomChanges.push({
          timestamp: Date.now(),
          zoom: parseFloat(zoomMatch[1]),
          action: text.includes('zoomAt') ? 'zoomAt' : text.includes('zoomTo') ? 'zoomTo' : 'update'
        });
      }
    }
  });

  try {
    console.log('🌐 Navigating to http://localhost:3000/editor...');
    await page.goto('http://localhost:3000/editor', { waitUntil: 'networkidle' });

    // Wait for canvas to be ready
    await page.waitForTimeout(2000);
    console.log('\n✅ Page loaded\n');

    // Get canvas element - make sure we're targeting the diagram canvas, not code editor
    await page.waitForSelector('canvas', { timeout: 5000 });

    // Get all canvas info
    const canvasInfo = await page.evaluate(() => {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      return canvases.map((c, i) => ({
        index: i,
        width: c.width,
        height: c.height,
        rect: c.getBoundingClientRect()
      }));
    });

    console.log('📊 Found canvases:', canvasInfo);

    // Use the main diagram canvas (largest one by area)
    const mainCanvasIndex = canvasInfo.reduce((maxIdx, canvas, idx) => {
      const currentArea = canvasInfo[maxIdx].width * canvasInfo[maxIdx].height;
      const thisArea = canvas.width * canvas.height;
      return thisArea > currentArea ? idx : maxIdx;
    }, 0);

    console.log(`🎯 Using canvas index ${mainCanvasIndex} (largest by area)`);

    const canvas = page.locator('canvas').nth(mainCanvasIndex);
    const canvasBounds = await canvas.boundingBox();

    if (!canvasBounds) {
      throw new Error('Canvas not found');
    }

    console.log('📐 Canvas bounds:', canvasBounds);

    // Wait for initial animations to complete
    console.log('\n⏳ Waiting for zoomToFit animation to complete...');
    await page.waitForTimeout(2000);

    // Record initial state
    const initialState = await page.evaluate(() => {
      const engine = window.__diagramEngine;
      if (!engine) return null;
      const viewport = engine.viewportManager?.viewport;
      return {
        zoom: viewport?.zoom,
        pan: { ...viewport?.pan }
      };
    });

    console.log('📊 Initial state:', initialState);

    // BUG 1 TEST: Pan without zoom (initial load)
    console.log('\n🧪 BUG 1 TEST: Pan immediately after load (no zoom)...');
    const startX1 = canvasBounds.x + 50;
    const startY1 = canvasBounds.y + 50;
    const dragDistance = 100;
    const endX1 = startX1 + dragDistance;
    const endY1 = startY1 + dragDistance;

    console.log(`🖱️  Dragging ${dragDistance}px from (${Math.round(startX1)}, ${Math.round(startY1)}) to (${Math.round(endX1)}, ${Math.round(endY1)})`);

    await page.mouse.move(startX1, startY1);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(endX1, endY1, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const afterPan1State = await page.evaluate(() => {
      const engine = window.__diagramEngine;
      if (!engine) return null;
      const viewport = engine.viewportManager?.viewport;
      return {
        zoom: viewport?.zoom,
        pan: { ...viewport?.pan }
      };
    });

    console.log('📊 After first pan:', afterPan1State);

    const panDelta1X = afterPan1State.pan.x - initialState.pan.x;
    const panDelta1Y = afterPan1State.pan.y - initialState.pan.y;
    console.log(`📏 Pan delta: (${panDelta1X.toFixed(1)}, ${panDelta1Y.toFixed(1)}) - Expected: ~${dragDistance}px`);
    console.log(`⚠️  Pan multiplier: ${(panDelta1X / dragDistance).toFixed(2)}x`);

    // Wait a bit
    await page.waitForTimeout(1000);

    // BUG 2 TEST: Zoom then pan
    console.log('\n🧪 BUG 2 TEST: Zoom in, then pan...');
    const centerX = canvasBounds.x + canvasBounds.width / 2;
    const centerY = canvasBounds.y + canvasBounds.height / 2;

    await page.mouse.move(centerX, centerY);
    await page.mouse.wheel(0, -100);
    await page.waitForTimeout(500);

    const afterZoomState = await page.evaluate(() => {
      const engine = window.__diagramEngine;
      if (!engine) return null;
      const viewport = engine.viewportManager?.viewport;
      return {
        zoom: viewport?.zoom,
        pan: { ...viewport?.pan }
      };
    });

    console.log('📊 After zoom:', afterZoomState);

    // Pan again
    const startX2 = canvasBounds.x + 50;
    const startY2 = canvasBounds.y + 50;
    const endX2 = startX2 + dragDistance;
    const endY2 = startY2 + dragDistance;

    console.log(`🖱️  Dragging ${dragDistance}px from (${Math.round(startX2)}, ${Math.round(startY2)}) to (${Math.round(endX2)}, ${Math.round(endY2)})`);

    await page.mouse.move(startX2, startY2);
    await page.waitForTimeout(100);
    await page.mouse.down();
    await page.waitForTimeout(100);
    await page.mouse.move(endX2, endY2, { steps: 10 });
    await page.waitForTimeout(100);
    await page.mouse.up();
    await page.waitForTimeout(500);

    const afterPan2State = await page.evaluate(() => {
      const engine = window.__diagramEngine;
      if (!engine) return null;
      const viewport = engine.viewportManager?.viewport;
      return {
        zoom: viewport?.zoom,
        pan: { ...viewport?.pan }
      };
    });

    console.log('📊 After second pan:', afterPan2State);

    const panDelta2X = afterPan2State.pan.x - afterZoomState.pan.x;
    const panDelta2Y = afterPan2State.pan.y - afterZoomState.pan.y;
    console.log(`📏 Pan delta: (${panDelta2X.toFixed(1)}, ${panDelta2Y.toFixed(1)}) - Expected: ~${dragDistance}px`);
    console.log(`⚠️  Pan multiplier: ${(panDelta2X / dragDistance).toFixed(2)}x`);

    // Summary
    console.log('\n' + '='.repeat(60));
    console.log('📋 SUMMARY');
    console.log('='.repeat(60));
    console.log('BUG 1 (Initial pan):');
    console.log(`  Zoom: ${initialState?.zoom?.toFixed(4)} → ${afterPan1State?.zoom?.toFixed(4)} (${afterPan1State.zoom === initialState.zoom ? '✅ SAME' : '❌ CHANGED'})`);
    console.log(`  Pan multiplier: ${(panDelta1X / dragDistance).toFixed(2)}x (expected: ~1.0x)`);
    console.log('');
    console.log('BUG 2 (Pan after zoom):');
    console.log(`  Zoom: ${afterZoomState?.zoom?.toFixed(4)} → ${afterPan2State?.zoom?.toFixed(4)} (${afterPan2State.zoom === afterZoomState.zoom ? '✅ SAME' : '❌ CHANGED'})`);
    console.log(`  Pan multiplier: ${(panDelta2X / dragDistance).toFixed(2)}x (expected: ~1.0x)`);
    console.log('='.repeat(60));

    // Keep browser open for manual inspection
    console.log('\n⏸️  Browser will stay open for 30 seconds for manual inspection...');
    console.log('🎥 Video is being recorded to ./test-videos/');
    await page.waitForTimeout(30000);

  } catch (error) {
    console.error('❌ Test failed:', error);
  } finally {
    console.log('\n💾 Saving video and closing browser...');
    await context.close();
    await browser.close();
    console.log('✅ Video saved to ./test-videos/');
  }
}

testZoomBugs().catch(console.error);
