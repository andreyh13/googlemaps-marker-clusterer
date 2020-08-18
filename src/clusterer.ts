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
  private pReady = false;
  private pPrevZoom = 1;
  private pZoomChangedListener: google.maps.MapsEventListener | null = null;
  private pIdleListener: google.maps.MapsEventListener | null = null;
  private pFirstIdle = true;
  private pTilesReady = false;
  private pChanges = 0;
  private pReadyForFiltering = false;
  private pCalculator: (markers: google.maps.Marker[], numStyles: number) => ISums;
  private pGridBasedStrategy = false;
  private pGridGlobal = false;

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
    this.pGridBasedStrategy = build.gridBasedStrategy;
    this.pGridGlobal = build.gridGlobal;
    this.pCalculator = this.calculatorDef.bind(this);
    this.init();
  }

  /* ---- Getters ---- */
  get map(): google.maps.Map {
    return this.pMap;
  }

  get gridSize(): number {
    return this.pGridSize;
  }

  get minClusterSize(): number {
    return this.pMinClusterSize;
  }

  get maxZoom(): number {
    return this.pMaxZoom;
  }

  get className(): string {
    return this.pClassName;
  }

  get styles(): IStyle[] {
    return this.pStyles;
  }

  set styles(styles: IStyle[]) {
    this.pStyles = styles;
  }

  get calculator(): (markers: google.maps.Marker[], numStyles: number) => ISums {
    return this.pCalculator;
  }

  set calculator(calc: (markers: google.maps.Marker[], numStyles: number) => ISums) {
    this.pCalculator = calc;
  }

  get imagePath(): string {
    return this.pImagePath;
  }

  get imageExtension(): string {
    return this.pImageExtension;
  }

  get isZoomOnClick(): boolean {
    return this.pZoomOnClick;
  }

  get isAverageCenter(): boolean {
    return this.pAverageCenter;
  }

  get clusters(): MarkerCluster[] {
    return this.pClusters;
  }

  get numMarkers(): number {
    // Returns number of not hidden markers
    const availableMarkers = this.markers.filter((marker) => marker.getVisible());
    return availableMarkers.length;
  }

  get hasMarkers(): boolean {
    // Returns true if there is at least one not hidden marker
    return this.numMarkers > 0;
  }

  get markers(): google.maps.Marker[] {
    // Returns sorted collection of all markers
    if (this.pChanges) {
      if (this.shouldUseInsertionSort()) {
        this.sortMarkers();
      } else {
        this.pMarkers.sort((a, b) => (a.getPosition()?.lng() ?? 0) - (b.getPosition()?.lng() ?? 0));
      }
      this.pChanges = 0;
    }
    return this.pMarkers;
  }

  get readyForFiltering(): boolean {
    return this.pReadyForFiltering;
  }

  /* ---- Public methods ---- */
  public setVisible(v: boolean): void {
    if (!v) {
      this.removeEventListeners();
      this.resetViewport();
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
      this.createClusters();
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
    this.resetViewport();
    this.removeEventListeners();
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
    this.resetViewport();
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
          this.resetViewport();
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
    this.setReady(true);
  }

  public onRemove(): void {
    this.removeEventListeners();
    this.setReady(false);
  }

  /* eslint-disable */
  public draw(): void {}
  /* eslint-enable */

  /* ---- Builder pattern implementation ---- */
  public static get Builder(): typeof Builder {
    return Builder;
  }

  private resetViewport(): void {
    for (const cluster of this.pClusters) {
      cluster.remove();
    }
    this.pClusters = [];
  }

  private setReady(ready: boolean): void {
    this.pReady = ready;
    if (ready) {
      if (this.hasMarkers && this.pFirstIdle && this.pTilesReady) {
        this.createClusters();
        this.pFirstIdle = false;
        this.pReadyForFiltering = true;
      }
    }
  }

  private sortClusters_(): void {
    for (let i = 1, j: number, tmp: MarkerCluster, tmpLng: number, length = this.pClusters.length; i < length; ++i) {
      tmp = this.pClusters[i];
      tmpLng = tmp.getBounds().getCenter().lng();
      for (j = i - 1; j >= 0 && this.pClusters[j].getBounds().getCenter().lng() > tmpLng; --j) {
        this.pClusters[j + 1] = this.pClusters[j];
      }
      this.pClusters[j + 1] = tmp;
    }
  }

  private sortMarkers(): void {
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

  private shouldUseInsertionSort(): boolean {
    if (this.pChanges > 300 || !this.pMarkers.length) {
      return false;
    } else {
      return this.pChanges / this.pMarkers.length < 0.2;
    }
  }

  private indexLowerBoundLng(lng: number): number {
    // It's a binary search algorithm
    let it: number;
    let step: number;
    let first = 0;
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

  private createClusters(): void {
    if (this.pGridBasedStrategy) {
      this.gridBasedClustering();
    } else {
      this.fastAlgorithmClustering();
    }
  }

  private fastAlgorithmClustering(): void {
    if (!this.pReady || !this.getMap()) {
      return;
    }

    const map: google.maps.Map = this.getMap() as google.maps.Map;
    const mapBounds = map.getBounds() ?? new google.maps.LatLngBounds();
    const extendedBounds = this.getExtendedBounds(mapBounds);
    // Binary search for the first interesting feature
    const firstIndex = this.indexLowerBoundLng(extendedBounds.getSouthWest().lng());
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
          let isClusterFound = false;
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
              isClusterFound = true;
              break;
            }
          }

          // If the feature doesn't fit in any cluster,
          // we must create a brand new cluster.
          if (!isClusterFound) {
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

  private gridBasedClustering(): void {
    if (!this.pReady || !this.getMap()) {
      return;
    }

    const map: google.maps.Map = this.getMap() as google.maps.Map;
    const mapBounds = map.getBounds() ?? new google.maps.LatLngBounds();
    if (mapBounds) {
      const extendedBounds = this.getExtendedBounds(mapBounds);
      const projection = this.getProjection();
      let northEast;
      let southWest;
      if (this.pGridGlobal) {
        northEast = new google.maps.LatLng(85, 175);
        southWest = new google.maps.LatLng(-85, -175);
      } else {
        northEast = mapBounds.getNorthEast();
        southWest = mapBounds.getSouthWest();
      }
      const tr = projection.fromLatLngToDivPixel(northEast);
      const bl = projection.fromLatLngToDivPixel(southWest);
      if (tr.x < 0) tr.x = -tr.x;
      if (bl.x > 0) bl.x = -bl.x;
      let x = bl.x;
      let y = tr.y;
      while (x < tr.x) {
        while (y < bl.y) {
          const center = projection.fromDivPixelToLatLng(new google.maps.Point(x + this.gridSize, y + this.gridSize));
          if (extendedBounds.contains(center)) {
            this.clusters.push(new MarkerCluster(this.map, center));
          }
          y += 2 * this.gridSize;
        }
        y = tr.y;
        x += 2 * this.gridSize;
      }

      const firstIndex = this.indexLowerBoundLng(extendedBounds.getSouthWest().lng());
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
            const found = this.clusters.find((cluster) => cluster.isMarkerInClusterBounds(marker));
            if (found) {
              found.addMarker(marker);
            }
          }
        }
      }
    }
  }

  private init(): void {
    this.setupStyles();
    if (this.pMap) {
      google.maps.event.addListenerOnce(this.pMap, 'tilesLoadedFirst', () => {
        this.pTilesReady = true;
        if (this.pReady) {
          this.setReady(this.pReady);
        }
      });
      this.setMap(this.pMap);
    }
  }

  private setupStyles(): void {
    if (this.pStyles.length) {
      return;
    }
    SIZES.forEach((size, i) => {
      this.pStyles.push({
        height: size,
        url: `${this.pImagePath}${i + 1}.${this.pImageExtension}`,
        width: size,
      });
    });
  }

  private calculatorDef(markers: google.maps.Marker[], numStyles: number): ISums {
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

  private removeEventListeners(): void {
    this.pZoomChangedListener?.remove();
    this.pIdleListener?.remove();
  }
}
