export class Loader {
  public static async getClusterer(): Promise<any> {
    if (google && google.maps && google.maps.OverlayView) {
      const module = await import('./clusterer');
      return module.MarkerClusterer;
    } else {
      /* eslint-disable */
      console.error('Google Maps JavaScript API v3 is not loaded. Cannot initialize MarkerClusterer.');
      /* eslint-enable */
      return undefined;
    }
  }
}
