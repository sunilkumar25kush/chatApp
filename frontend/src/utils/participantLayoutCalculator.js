/**
 * Participant Grid Layout Calculator (Mobile-First & Adaptive)
 * Automatically calculates optimal grid dimensions, columns, rows,
 * and tile positioning based on participant count, viewport width,
 * viewport height, and orientation.
 */

export function calculateParticipantLayout({ count, width, height }) {
  const isPortrait = height > width;
  const isMobile = width < 768;
  const isLandscapeMobile = !isPortrait && height < 500;
  const isCompactPhone = width <= 360;

  // Maximum tiles visible on screen before overflowing into roster
  // 4 on ultra-compact, 6 on mobile portrait, 8 on mobile landscape, 12 on desktop
  const maxVisible = isCompactPhone ? 4 : isMobile ? 6 : isLandscapeMobile ? 8 : 12;
  const hasOverflow = count > maxVisible;
  const visibleCount = hasOverflow ? maxVisible : count;

  // ── 1. Single Participant ───────────────────────────────────────────────
  if (visibleCount === 1) {
    return {
      type: 'single',
      columns: 1,
      rows: 1,
      visibleCount: 1,
      hasOverflow,
      overflowCount: count - 1,
      isPortrait,
      isMobile,
      isLandscapeMobile,
      gridStyle: {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100%',
      },
      tileStyle: () => ({
        width: '100%',
        maxWidth: isPortrait ? '100%' : 'min(94vw, 1080px)',
        height: '100%',
        maxHeight: isPortrait
          ? 'min(84dvh, 680px)'
          : isLandscapeMobile
          ? 'min(76dvh, 320px)'
          : 'min(78dvh, 760px)',
        aspectRatio: isPortrait ? '9/16' : '16/9',
      }),
    };
  }

  // ── 2. Two Participants ─────────────────────────────────────────────────
  if (visibleCount === 2) {
    if (isPortrait) {
      // Mobile portrait: 2 stacked vertical tiles (50% height each)
      return {
        type: 'two-portrait',
        columns: 1,
        rows: 2,
        visibleCount: 2,
        hasOverflow,
        overflowCount: count - 2,
        isPortrait,
        isMobile,
        isLandscapeMobile,
        gridStyle: {
          display: 'grid',
          gridTemplateColumns: '1fr',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: isCompactPhone ? 6 : 8,
          width: '100%',
          height: '100%',
        },
        tileStyle: () => ({ width: '100%', height: '100%' }),
      };
    }

    // Landscape: 2 side-by-side columns (50% width each)
    return {
      type: 'two-landscape',
      columns: 2,
      rows: 1,
      visibleCount: 2,
      hasOverflow,
      overflowCount: count - 2,
      isPortrait,
      isMobile,
      isLandscapeMobile,
      gridStyle: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gridTemplateRows: '1fr',
        gap: isLandscapeMobile ? 8 : 12,
        width: '100%',
        height: '100%',
      },
      tileStyle: () => ({ width: '100%', height: '100%' }),
    };
  }

  // ── 3. Three Participants (Balanced Layout) ─────────────────────────────
  if (visibleCount === 3) {
    if (isPortrait) {
      // Portrait: Row 1 has 1 full-width tile; Row 2 has 2 half-width tiles
      return {
        type: 'three-portrait',
        columns: 2,
        rows: 2,
        visibleCount: 3,
        hasOverflow,
        overflowCount: count - 3,
        isPortrait,
        isMobile,
        isLandscapeMobile,
        gridStyle: {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
          gap: isCompactPhone ? 6 : 8,
          width: '100%',
          height: '100%',
        },
        tileStyle: (index) => {
          if (index === 0) {
            return {
              gridColumn: '1 / span 2',
              width: '100%',
              height: '100%',
            };
          }
          return { width: '100%', height: '100%' };
        },
      };
    }

    // Landscape: Row 1 has 2 tiles; Row 2 has 1 centered tile
    return {
      type: 'three-landscape',
      columns: 2,
      rows: 2,
      visibleCount: 3,
      hasOverflow,
      overflowCount: count - 3,
      isPortrait,
      isMobile,
      isLandscapeMobile,
      gridStyle: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
        gap: isLandscapeMobile ? 6 : 12,
        width: '100%',
        height: '100%',
      },
      tileStyle: (index) => {
        if (index === 2) {
          return {
            gridColumn: '1 / span 2',
            justifySelf: 'center',
            width: 'calc(50% - 6px)',
            height: '100%',
          };
        }
        return { width: '100%', height: '100%' };
      },
    };
  }

  // ── 4. Four Participants (2x2 Grid) ─────────────────────────────────────
  if (visibleCount === 4) {
    return {
      type: 'four',
      columns: 2,
      rows: 2,
      visibleCount: 4,
      hasOverflow,
      overflowCount: count - 4,
      isPortrait,
      isMobile,
      isLandscapeMobile,
      gridStyle: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
        gap: isCompactPhone ? 4 : isMobile || isLandscapeMobile ? 6 : 12,
        width: '100%',
        height: '100%',
      },
      tileStyle: () => ({ width: '100%', height: '100%' }),
    };
  }

  // ── 5. Five to Six Participants ─────────────────────────────────────────
  if (visibleCount >= 5 && visibleCount <= 6) {
    if (isPortrait) {
      // Portrait: 2 columns x 3 rows
      return {
        type: 'five-six-portrait',
        columns: 2,
        rows: 3,
        visibleCount,
        hasOverflow,
        overflowCount: count - visibleCount,
        isPortrait,
        isMobile,
        isLandscapeMobile,
        gridStyle: {
          display: 'grid',
          gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
          gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
          gap: isCompactPhone ? 4 : 6,
          width: '100%',
          height: '100%',
        },
        tileStyle: (index) => {
          if (visibleCount === 5 && index === 4) {
            return {
              gridColumn: '1 / span 2',
              justifySelf: 'center',
              width: 'calc(50% - 4px)',
              height: '100%',
            };
          }
          return { width: '100%', height: '100%' };
        },
      };
    }

    // Landscape: 3 columns x 2 rows
    return {
      type: 'five-six-landscape',
      columns: 3,
      rows: 2,
      visibleCount,
      hasOverflow,
      overflowCount: count - visibleCount,
      isPortrait,
      isMobile,
      isLandscapeMobile,
      gridStyle: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(2, minmax(0, 1fr))',
        gap: isLandscapeMobile ? 6 : 10,
        width: '100%',
        height: '100%',
      },
      tileStyle: (index) => {
        if (visibleCount === 5 && index === 3) {
          return {
            gridColumn: '1 / span 2',
            justifySelf: 'end',
            width: 'calc(66.6% - 5px)',
            height: '100%',
          };
        }
        if (visibleCount === 5 && index === 4) {
          return {
            gridColumn: '2 / span 2',
            justifySelf: 'start',
            width: 'calc(66.6% - 5px)',
            height: '100%',
          };
        }
        return { width: '100%', height: '100%' };
      },
    };
  }

  // ── 6. Seven to Nine Participants ───────────────────────────────────────
  if (visibleCount >= 7 && visibleCount <= 9) {
    if (isPortrait) {
      const cols = visibleCount > 8 ? 3 : 2;
      const rows = Math.ceil(visibleCount / cols);
      return {
        type: 'seven-nine-portrait',
        columns: cols,
        rows,
        visibleCount,
        hasOverflow,
        overflowCount: count - visibleCount,
        isPortrait,
        isMobile,
        isLandscapeMobile,
        gridStyle: {
          display: 'grid',
          gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
          gap: 6,
          width: '100%',
          height: '100%',
        },
        tileStyle: () => ({ width: '100%', height: '100%' }),
      };
    }

    // Landscape: 3 columns x 3 rows
    return {
      type: 'seven-nine-landscape',
      columns: 3,
      rows: 3,
      visibleCount,
      hasOverflow,
      overflowCount: count - visibleCount,
      isPortrait,
      isMobile,
      isLandscapeMobile,
      gridStyle: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gridTemplateRows: 'repeat(3, minmax(0, 1fr))',
        gap: isLandscapeMobile ? 4 : 8,
        width: '100%',
        height: '100%',
      },
      tileStyle: () => ({ width: '100%', height: '100%' }),
    };
  }

  // ── 7. Ten to Twelve+ Participants (Adaptive Grid) ───────────────────────
  const cols = isPortrait ? (isCompactPhone ? 2 : 3) : isLandscapeMobile ? 4 : 4;
  const rows = Math.ceil(visibleCount / cols);

  return {
    type: 'adaptive',
    columns: cols,
    rows,
    visibleCount,
    hasOverflow,
    overflowCount: count - visibleCount,
    isPortrait,
    isMobile,
    isLandscapeMobile,
    gridStyle: {
      display: 'grid',
      gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
      gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
      gap: 4,
      width: '100%',
      height: '100%',
    },
    tileStyle: () => ({ width: '100%', height: '100%' }),
  };
}
