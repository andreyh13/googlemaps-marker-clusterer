import { MarkerClusterer } from './clusterer';

const instances: WeakMap<google.maps.Map, MarkerClusterer> = new WeakMap();

export class ClustererHelper {
  public static isMarkerInBounds(marker: google.maps.Marker, bounds: google.maps.LatLngBounds): boolean {
    const pos = marker.getPosition();
    if (bounds && pos) {
      return bounds.contains(pos);
    }
    return false;
  }

  public static getClusterer(map: google.maps.Map): MarkerClusterer | undefined {
    if (instances.has(map)) {
      return instances.get(map);
    }
    return undefined;
  }

  public static setClusterer(map: google.maps.Map, clusterer: MarkerClusterer): void {
    if (instances.has(map)) {
      const prevInstance = instances.get(map);
      prevInstance?.destroy();
      instances.delete(map);
    }
    instances.set(map, clusterer);
  }
}
