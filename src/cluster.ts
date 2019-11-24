import { MarkerClusterer } from './clusterer';
import { MarkerClusterIcon } from './clustericon';
import { CLASS_NAME_DEFAULT, GRID_SIZE_DEFAULT, MAX_ZOOM_DEFAULT, MIN_CLUSTER_SIZE_DEFAULT } from './constants';
import { ClustererHelper } from './helper';

export class MarkerCluster {
  private static counter = 0;
  private map: google.maps.Map | null = null;
  private center: google.maps.LatLng | null = null;
  private markers: google.maps.Marker[] = [];
  private bounds: google.maps.LatLngBounds = new google.maps.LatLngBounds();
  private id: number;
  private icon: MarkerClusterIcon | null;

  constructor(map: google.maps.Map, center: google.maps.LatLng) {
    this.map = map;
    this.center = center;
    this.id = ++MarkerCluster.counter;
    this.calculateBounds_();
    this.icon = new MarkerClusterIcon(map, this.id);
  }

  get classId(): string {
    return `${this.className}-${this.id}`;
  }

  get clusterer(): MarkerClusterer | undefined {
    return (this.map && ClustererHelper.getClusterer(this.map)) ?? undefined;
  }

  get size(): number {
    return this.markers.length;
  }

  get minClusterSize(): number {
    return this.clusterer?.minClusterSize ?? MIN_CLUSTER_SIZE_DEFAULT;
  }

  get isAverageCenter(): boolean {
    return this.clusterer?.isAverageCenter ?? true;
  }

  get className(): string {
    return this.clusterer?.className ?? CLASS_NAME_DEFAULT;
  }

  get gridSize(): number {
    return this.clusterer?.gridSize ?? GRID_SIZE_DEFAULT;
  }

  get clusterBounds(): google.maps.LatLngBounds {
    return this.bounds;
  }

  public getBounds(): google.maps.LatLngBounds {
    const bounds = new google.maps.LatLngBounds();
    if (this.center) {
      bounds.extend(this.center);
    }
    for (const marker of this.markers) {
      const pos = marker.getPosition();
      if (pos) {
        bounds.extend(pos);
      }
    }
    return bounds;
  }

  public isMarkerInClusterBounds(marker: google.maps.Marker): boolean {
    const pos = marker.getPosition();
    if (pos) {
      return this.bounds?.contains(pos);
    }
    return false;
  }

  public addMarker(marker: google.maps.Marker): boolean {
    if (this.isFeatureAlreadyAdded_(marker)) {
      return false;
    }
    marker.set('clusterID', this.classId);
    this.markers.push(marker);
    this.updateClusterCenter_(marker);
    if (this.markers.length < this.minClusterSize) {
      this.hideInCluster_(marker);
    } else if (this.markers.length === this.minClusterSize) {
      for (const m of this.markers) {
        this.showInCluster_(m);
      }
    } else {
      this.showInCluster_(marker);
    }
    this.updateIcon();
    return true;
  }

  public remove(): void {
    this.icon?.remove();
    this.icon = null;
    this.markers = [];
    delete this.markers;
    this.map = null;
    this.center = null;
  }

  public updateIcon(): void {
    const zoom = this.map?.getZoom() ?? 1;
    const mz = this.clusterer?.maxZoom ?? MAX_ZOOM_DEFAULT;
    if (mz && zoom > mz) {
      // The zoom is greater than our max zoom so show all the features of cluster.
      for (const m of this.markers) {
        this.hideInCluster_(m);
      }
      return;
    }
    if (this.size < this.minClusterSize) {
      // Min cluster size not yet reached.
      this.icon?.hide();
      return;
    }
    const numStyles = this.clusterer?.styles.length ?? 0;
    const sums = this.clusterer?.calculator(this.markers, numStyles);

    if (sums) {
      this.icon?.setSums(sums);
    }
    if (this.center) {
      this.icon?.setCenter(this.center);
    }
    this.icon?.show();
  }

  public getId(): number {
    return this.id;
  }

  private isFeatureAlreadyAdded_(marker: google.maps.Marker) {
    return this.markers.indexOf(marker) !== -1;
  }

  private hideInCluster_(marker: google.maps.Marker): void {
    if (!marker.getVisible()) {
      marker.setMap(null);
    } else {
      marker.setMap(this.map);
    }
  }

  private showInCluster_(marker: google.maps.Marker): void {
    marker.setMap(null);
  }

  private updateClusterCenter_(marker: google.maps.Marker): void {
    if (!this.center) {
      this.center = marker.getPosition() ?? null;
      this.calculateBounds_();
    } else {
      if (this.isAverageCenter) {
        const l = this.markers.length + 1;
        const lat = (this.center.lat() * (l - 1) + (marker.getPosition()?.lat() ?? this.center.lat())) / l;
        const lng = (this.center.lng() * (l - 1) + (marker.getPosition()?.lng() ?? this.center.lng())) / l;
        this.center = new google.maps.LatLng(lat, lng);
        this.calculateBounds_();
      }
    }
  }

  private calculateBounds_(): void {
    const mBounds = new google.maps.LatLngBounds();
    if (this.center) {
      mBounds.extend(this.center);
    }
    this.bounds = this.clusterer?.getExtendedBounds(mBounds) ?? mBounds;
  }
}
