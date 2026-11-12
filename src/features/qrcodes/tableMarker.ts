// Black symbol only. Its white quiet zone is outside the measured square.
export const MARKER_MM = 50;
export const MARKER_HASH = '#ar-menu-50mm';

export function isTableMarker(value: string, currentPage: string) {
  try {
    const marker = new URL(value);
    const page = new URL(currentPage);
    const restaurant = page.pathname.split('/')[2];
    return Boolean(
      restaurant &&
        marker.hash === MARKER_HASH &&
        marker.origin === page.origin &&
        marker.pathname.startsWith('/r/') &&
        marker.pathname.split('/')[2] === restaurant,
    );
  } catch {
    return false;
  }
}
