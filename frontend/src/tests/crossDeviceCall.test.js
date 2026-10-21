import { describe, it } from 'vitest';
import assert from 'node:assert';
import { calculateParticipantLayout } from '../utils/participantLayoutCalculator.js';
import { livekitMediaService } from '../services/livekitMediaService.js';

describe('Cross-Device Call Layouts & Presets', () => {
  const viewports = [
    // Desktop
    { name: 'Desktop HD', width: 1280, height: 720, category: 'Desktop' },
    { name: 'Desktop WXGA', width: 1366, height: 768, category: 'Desktop' },
    { name: 'Desktop WXGA+', width: 1440, height: 900, category: 'Desktop' },
    { name: 'Desktop FHD', width: 1920, height: 1080, category: 'Desktop' },

    // Tablet
    { name: 'iPad Mini / Air', width: 768, height: 1024, category: 'Tablet' },
    { name: 'iPad 10th Gen', width: 820, height: 1180, category: 'Tablet' },
    { name: 'iPad Pro 12.9"', width: 1024, height: 1366, category: 'Tablet' },

    // Mobile
    { name: 'iPhone SE (1st gen)', width: 320, height: 568, category: 'Mobile' },
    { name: 'Galaxy S6 / Note', width: 360, height: 640, category: 'Mobile' },
    { name: 'iPhone 8 / SE2', width: 375, height: 667, category: 'Mobile' },
    { name: 'iPhone 12/13/14', width: 390, height: 844, category: 'Mobile' },
    { name: 'Pixel 7 / S21', width: 412, height: 915, category: 'Mobile' },
    { name: 'iPhone 15 Pro Max', width: 430, height: 932, category: 'Mobile' },
  ];

  const participantCounts = [1, 2, 3, 4, 5, 6, 8, 12];

  it('calculates valid grid layouts across all viewport and participant combinations', () => {
    let passedCombinations = 0;
    for (const vp of viewports) {
      for (const count of participantCounts) {
        const layout = calculateParticipantLayout({
          count,
          width: vp.width,
          height: vp.height,
        });

        // 1. Validate grid structural properties
        assert(layout.columns >= 1, `${vp.name} (${count}p): columns must be >= 1`);
        assert(layout.rows >= 1, `${vp.name} (${count}p): rows must be >= 1`);
        assert(layout.visibleCount >= 1, `${vp.name} (${count}p): visibleCount must be >= 1`);
        assert(layout.visibleCount <= count, `${vp.name} (${count}p): visibleCount cannot exceed count`);
        assert(layout.gridStyle, `${vp.name} (${count}p): gridStyle must be defined`);

        // 2. Validate overflow calculations
        if (layout.hasOverflow) {
          assert(layout.overflowCount > 0, `${vp.name} (${count}p): overflowCount must be > 0`);
          assert.strictEqual(layout.overflowCount, count - layout.visibleCount);
        } else {
          assert.strictEqual(layout.visibleCount, count);
        }

        // 3. Validate tile styling generator
        if (typeof layout.tileStyle === 'function') {
          for (let i = 0; i < layout.visibleCount; i++) {
            const style = layout.tileStyle(i);
            assert(style, `${vp.name} (${count}p): tileStyle(${i}) must return an object`);
          }
        }

        passedCombinations++;
      }
    }
    assert.strictEqual(passedCombinations, viewports.length * participantCounts.length);
  });

  it('handles mobile portrait and landscape transitions cleanly', () => {
    const mobileDevices = [
      { name: 'iPhone 14', portrait: { width: 390, height: 844 }, landscape: { width: 844, height: 390 } },
      { name: 'Pixel 7', portrait: { width: 412, height: 915 }, landscape: { width: 915, height: 412 } },
    ];

    for (const dev of mobileDevices) {
      const pLayout = calculateParticipantLayout({ count: 4, width: dev.portrait.width, height: dev.portrait.height });
      assert.strictEqual(pLayout.isPortrait, true);
      assert.strictEqual(pLayout.isLandscapeMobile, false);

      const lLayout = calculateParticipantLayout({ count: 4, width: dev.landscape.width, height: dev.landscape.height });
      assert.strictEqual(lLayout.isPortrait, false);
      assert.strictEqual(lLayout.isLandscapeMobile, true);
    }
  });

  it('preserves stacked tiles cleanly when on-screen virtual keyboard shrinks viewport height', () => {
    const keyboardOpenHeight = 460;
    const kbLayout = calculateParticipantLayout({ count: 2, width: 390, height: keyboardOpenHeight });
    assert.strictEqual(kbLayout.visibleCount, 2);
    assert.strictEqual(kbLayout.rows, 2);
  });

  it('selects appropriate adaptive resolution presets based on participant count', () => {
    const p1Preset = livekitMediaService.getOptimalVideoPreset(1);
    assert.strictEqual(p1Preset.width, 1280);
    assert.strictEqual(p1Preset.height, 720);

    const p4Preset = livekitMediaService.getOptimalVideoPreset(4);
    assert.strictEqual(p4Preset.width, 960);
    assert.strictEqual(p4Preset.height, 540);

    const p8Preset = livekitMediaService.getOptimalVideoPreset(8);
    assert.strictEqual(p8Preset.width, 640);
    assert.strictEqual(p8Preset.height, 360);
  });
});
