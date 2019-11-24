import { Builder } from './builder';
import { MarkerCluster } from './cluster';
import { IStyle, ISums } from './interfaces';

const SIZES = [53, 56, 66, 78, 90];

export class MarkerClusterer extends google.maps.OverlayView {
  private pMap: google.maps.Map;
  private pGridSize: number;
  private pMinClusterSize: number;
  private pMaxZoom: number;
  private pClassName: string;
  private pStyles: IStyle[];
  private pImagePath: string;
  private pImageExtension: string;
  private pZoomOnClick: boolean;
  private pAverageCenter: boolean;
  private pMarkers: google.maps.Marker[] = [];
  private pClusters: MarkerCluster[] = [];
  private pReady: boolean = false;
  private pPrevZoom: number = 1;
  private pZoomChangedListener: google.maps.MapsEventListener | null = null;
  private pIdleListener: google.maps.MapsEventListener | null = null;
  private pFirstIdle: boolean = true;
  private pTilesReady: boolean = false;
  private pChanges: number = 0;
  private pReadyForFiltering = false;
  private pCalculator: (markers: google.maps.Marker[], numStyles: number) => ISums;

  constructor(build: Builder) {
    super();
    this.pMap = build.map;
    this.pGridSize = build.gridSize;
    this.pMinClusterSize = build.minClusterSize;
    this.pMaxZoom = build.maxZoom;
    this.pClassName = build.className;
    this.pStyles = build.styles;
    this.pImagePath = build.imagePath;
    this.pImageExtension = build.imageExtension;
    this.pZoomOnClick = build.zoomOnClick;
    this.pAverageCenter = build.averageCenter;
    this.pCalculator = this.calculator_;
    this.init_();
  }

  /* ---- Getters ---- */
  get map() {
    return this.pMap;
  }

  get gridSize() {
    return this.pGridSize;
  }

  get minClusterSize() {
    return this.pMinClusterSize;
  }

  get maxZoom() {
    return this.pMaxZoom;
  }

  get className() {
    return this.pClassName;
  }

  get styles() {
    return this.pStyles;
  }

  set styles(styles: IStyle[]) {
    this.pStyles = styles;
  }

  get calculator() {
    return this.pCalculator;
  }

  set calculator(calc) {
    this.pCalculator = calc;
  }

  get imagePath() {
    return this.pImagePath;
  }

  get imageExtension() {
    return this.pImageExtension;
  }

  get isZoomOnClick() {
    return this.pZoomOnClick;
  }

  get isAverageCenter() {
    return this.pAverageCenter;
  }

  get clusters() {
    return this.pClusters;
  }

  get numMarkers() {
    // Returns number of not hidden markers
    const availableMarkers = this.markers.filter(marker => marker.getVisible());
    return availableMarkers.length;
  }

  get hasMarkers() {
    // Returns true if there is at least one not hidden marker
    return this.numMarkers > 0;
  }

  get markers() {
    // Returns sorted collection of all markers
    if (this.pChanges) {
      if (this.shouldUseInsertionSort_()) {
        this.sortMarkers_();
      } else {
        this.pMarkers.sort((a, b) => (a.getPosition()?.lng() ?? 0) - (b.getPosition()?.lng() ?? 0));
      }
      this.pChanges = 0;
    }
    return this.pMarkers;
  }

  get readyForFiltering() {
    return this.pReadyForFiltering;
  }

  /* ---- Public methods ---- */
  public setVisible(v: boolean): void {
    if (!v) {
      this.removeEventListeners_();
      this.resetViewport_();
      this.setMap(null);
    } else {
      this.setMap(this.pMap);
    }
  }

  public getTotalClusters(): number {
    return this.pClusters.length;
  }

  public getClustererBounds(): google.maps.LatLngBounds {
    const clustererBounds = new google.maps.LatLngBounds();
    if (this.getTotalClusters() > 0) {
      for (const cluster of this.clusters) {
        clustererBounds.union(cluster.getBounds());
      }
    }
    return clustererBounds;
  }

  public getMarkersBounds(): google.maps.LatLngBounds {
    const markersBounds = new google.maps.LatLngBounds();
    for (const marker of this.markers) {
      const pos = marker.getPosition();
      if (marker.getVisible() && pos) {
        markersBounds.extend(pos);
      }
    }
    return markersBounds;
  }

  public getExtendedBounds(bounds: google.maps.LatLngBounds): google.maps.LatLngBounds {
    const projection = this.getProjection();
    if (bounds.getNorthEast().lng() < bounds.getSouthWest().lng()) {
      bounds = new google.maps.LatLngBounds(
        new google.maps.LatLng(bounds.getSouthWest().lat(), -179.0),
        new google.maps.LatLng(bounds.getNorthEast().lat(), 179.0),
      );
    } else {
      // Convert the points to pixels and the extend out by the grid size.
      const trPix = projection.fromLatLngToDivPixel(bounds.getNorthEast());
      trPix.x += this.gridSize;
      trPix.y -= this.gridSize;

      const blPix = projection.fromLatLngToDivPixel(bounds.getSouthWest());
      blPix.x -= this.gridSize;
      blPix.y += this.gridSize;

      // Extend the bounds to contain the new bounds.
      const ne = projection.fromDivPixelToLatLng(trPix);
      const sw = projection.fromDivPixelToLatLng(blPix);

      if (ne.lat() > bounds.getNorthEast().lat() && ne.lng() > bounds.getNorthEast().lng()) {
        bounds.extend(ne);
      }
      if (sw.lat() < bounds.getSouthWest().lat() && sw.lng() < bounds.getSouthWest().lng()) {
        bounds.extend(sw);
      }
    }
    return bounds;
  }

  public redraw(): void {
    const oldClusters = this.clusters.slice();
    this.clusters.length = 0;

    if (this.hasMarkers) {
      this.createClusters_();
    } else {
      for (const marker of this.markers) {
        marker.setMap(null);
      }
    }

    // Remove the old clusters.
    // Do it in a timeout so the other clusters have been drawn first.
    window.requestAnimationFrame(() => {
      for (const oCluster of oldClusters) {
        oCluster.remove();
      }
      oldClusters.length = 0;
    });
  }

  public destroy(): void {
    this.resetViewport_();
    this.removeEventListeners_();
    for (const marker of this.markers) {
      marker.setMap(null);
    }
    this.pStyles = [];
    this.pMarkers = [];
    this.pClusters = [];
  }

  public createMarker(options: google.maps.MarkerOptions): google.maps.Marker {
    options.map = undefined;
    const m = new google.maps.Marker(options);
    m.setMap(null);
    this.pMarkers.push(m);
    this.pChanges += 1;
    return m;
  }

  public clearMarkers(): void {
    this.pMarkers = [];
    this.resetViewport_();
    this.redraw();
  }

  /* ---- google.maps.OverlayView interface methods ---- */
  public onAdd(): void {
    if (!this.getMap()) {
      return this.onRemove();
    }

    this.pPrevZoom = this.getMap().getZoom();
    // Add the map event listeners
    if (!this.pZoomChangedListener) {
      this.pZoomChangedListener = google.maps.event.addListener(this.getMap(), 'zoom_changed', () => {
        const zoom = this.pMap.getZoom();
        if (this.pPrevZoom !== zoom) {
          this.pPrevZoom = zoom;
          this.resetViewport_();
        }
      });
    }
    if (!this.pIdleListener) {
      this.pIdleListener = google.maps.event.addListener(this.getMap(), 'idle', () => {
        if (!this.pFirstIdle) {
          this.redraw();
        } else {
          google.maps.event.trigger(this.pMap, 'tilesLoadedFirst');
        }
      });
    }
    this.setReady_(true);
  }

  public onRemove(): void {
    this.removeEventListeners_();
    this.setReady_(false);
  }

  /* tslint:disable*/
  public draw(): void {}
  /* tslint:enable*/

  /* ---- Builder pattern implementation ---- */
  public static get Builder(): typeof Builder {
    return Builder;
  }

  private resetViewport_(): void {
    for (const cluster of this.pClusters) {
      cluster.remove();
    }
    this.pClusters = [];
  }

  private setReady_(ready: boolean): void {
    this.pReady = ready;
    if (ready) {
      if (this.hasMarkers && this.pFirstIdle && this.pTilesReady) {
        this.createClusters_();
        this.pFirstIdle = false;
        this.pReadyForFiltering = true;
      }
    }
  }

  private sortClusters_(): void {
    for (let i = 1, j: number, tmp: MarkerCluster, tmpLng: number, length = this.pClusters.length; i < length; ++i) {
      tmp = this.pClusters[i];
      tmpLng = tmp
        .getBounds()
        .getCenter()
        .lng();
      for (
        j = i - 1;
        j >= 0 &&
        this.pClusters[j]
          .getBounds()
          .getCenter()
          .lng() > tmpLng;
        --j
      ) {
        this.pClusters[j + 1] = this.pClusters[j];
      }
      this.pClusters[j + 1] = tmp;
    }
  }

  private sortMarkers_(): void {
    for (
      let i = 1, j: number, tmp: google.maps.Marker, tmpLng: number, length = this.pMarkers.length;
      i < length;
      ++i
    ) {
      tmp = this.pMarkers[i];
      tmpLng = tmp.getPosition()?.lng() ?? 0;
      for (j = i - 1; j >= 0 && (this.pMarkers[j].getPosition()?.lng() ?? 0) > tmpLng; --j) {
        this.pMarkers[j + 1] = this.pMarkers[j];
      }
      this.pMarkers[j + 1] = tmp;
    }
  }

  private shouldUseInsertionSort_(): boolean {
    if (this.pChanges > 300 || !this.pMarkers.length) {
      return false;
    } else {
      return this.pChanges / this.pMarkers.length < 0.2;
    }
  }

  private indexLowerBoundLng_(lng: number): number {
    // It's a binary search algorithm
    let it: number;
    let step: number;
    let first: number = 0;
    let count = this.markers.length;
    while (count > 0) {
      step = Math.floor(count / 2);
      it = first + step;
      if ((this.markers[it].getPosition()?.lng() ?? 0) < lng) {
        first = ++it;
        count -= step + 1;
      } else {
        count = step;
      }
    }
    return first;
  }

  private createClusters_(): void {
    if (!this.pReady || !this.getMap()) {
      return;
    }

    const map: google.maps.Map = this.getMap() as google.maps.Map;
    const mapBounds = map.getBounds() ?? new google.maps.LatLngBounds();
    const extendedBounds = this.getExtendedBounds(mapBounds);
    // Binary search for the first interesting feature
    const firstIndex = this.indexLowerBoundLng_(extendedBounds.getSouthWest().lng());
    const workingClusterList = this.pClusters.slice(0);
    for (let i = firstIndex, l = this.markers.length; i < l; ++i) {
      const marker = this.markers[i];
      if ((marker.getPosition()?.lng() ?? 0) > extendedBounds.getNorthEast().lng()) {
        break;
      }
      if (
        (marker.getPosition()?.lat() ?? 0) > extendedBounds.getSouthWest().lat() &&
        (marker.getPosition()?.lat() ?? 0) < extendedBounds.getNorthEast().lat()
      ) {
        if (!marker.getVisible()) {
          marker.setMap(null);
        } else {
          let clusterFound = false;
          let cluster: MarkerCluster;
          for (let j = 0, ll = workingClusterList.length; j < ll; ++j) {
            cluster = workingClusterList[j];

            // If the cluster is far away the current marker
            // we can remove it from the list of active clusters
            // because we will never reach it again
            if (cluster.clusterBounds.getNorthEast().lng() < (marker.getPosition()?.lng() ?? 0)) {
              workingClusterList.splice(j, 1);
              --j;
              --ll;
              continue;
            }

            if (cluster.isMarkerInClusterBounds(marker)) {
              cluster.addMarker(marker);
              clusterFound = true;
              break;
            }
          }

          // If the feature doesn't fit in any cluster,
          // we must create a brand new cluster.
          if (!clusterFound) {
            const pos = marker.getPosition();
            if (pos) {
              const newCluster = new MarkerCluster(this.pMap, pos);
              newCluster.addMarker(marker);
              this.pClusters.push(newCluster);
              workingClusterList.push(newCluster);
            }
          }
        }
      }
    }
  }

  private init_(): void {
    this.setupStyles_();
    if (this.pMap) {
      google.maps.event.addListenerOnce(this.pMap, 'tilesLoadedFirst', () => {
        this.pTilesReady = true;
        if (this.pReady) {
          this.setReady_(this.pReady);
        }
      });
      this.setMap(this.pMap);
    }
  }

  private setupStyles_(): void {
    if (this.pStyles.length) {
      return;
    }
    SIZES.forEach((size, i) => {
      this.pStyles.push({
        height: size,
        url: this.pImagePath + (i + 1) + '.' + this.pImageExtension,
        width: size,
      });
    });
  }

  private calculator_(markers: google.maps.Marker[], numStyles: number): ISums {
    let index = 0;
    let dv = markers.length;
    while (dv !== 0) {
      dv = Math.floor(dv / 10);
      index++;
    }

    index = Math.min(index, numStyles);
    return {
      index,
      text: `${markers.length}`,
    };
  }

  private removeEventListeners_(): void {
    this.pZoomChangedListener?.remove();
    this.pIdleListener?.remove();
  }
}
