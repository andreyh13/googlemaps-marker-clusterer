import { MarkerClusterer } from './clusterer';
import {
  CLASS_NAME_DEFAULT,
  GRID_SIZE_DEFAULT,
  MARKER_CLUSTER_IMAGE_EXTENSION,
  MARKER_CLUSTER_IMAGE_PATH_DEFAULT,
  MAX_ZOOM_DEFAULT,
  MIN_CLUSTER_SIZE_DEFAULT,
} from './constants';
import { ClustererHelper } from './helper';
import { IStyle } from './interfaces';

export class Builder {
  private pMap: google.maps.Map;
  private pGridSize: number = GRID_SIZE_DEFAULT;
  private pMinClusterSize: number = MIN_CLUSTER_SIZE_DEFAULT;
  private pMaxZoom: number = MAX_ZOOM_DEFAULT;
  private pClassName: string = CLASS_NAME_DEFAULT;
  private pStyles: IStyle[] = [];
  private pImagePath: string = MARKER_CLUSTER_IMAGE_PATH_DEFAULT;
  private pImageExtension: string = MARKER_CLUSTER_IMAGE_EXTENSION;
  private pZoomOnClick: boolean = true;
  private pAverageCenter: boolean = true;

  constructor(map: google.maps.Map) {
    this.pMap = map;
  }

  public withGridSize(gridSize: number): Builder {
    this.pGridSize = gridSize;
    return this;
  }

  public withMinClusterSize(minClusterSize: number): Builder {
    this.pMinClusterSize = minClusterSize;
    return this;
  }

  public withMaxZoom(maxZoom: number): Builder {
    this.pMaxZoom = maxZoom;
    return this;
  }

  public withClassName(className: string): Builder {
    this.pClassName = className;
    return this;
  }

  public withStyles(styles: IStyle[]): Builder {
    this.pStyles = styles;
    return this;
  }

  public withImagePath(imagePath: string): Builder {
    this.pImagePath = imagePath;
    return this;
  }

  public withImageExtension(imageExtension: string): Builder {
    this.pImageExtension = imageExtension;
    return this;
  }

  public withZoomOnClick(zoomOnClick: boolean): Builder {
    this.pZoomOnClick = zoomOnClick;
    return this;
  }

  public withAverageCenter(averageCenter: boolean): Builder {
    this.pAverageCenter = averageCenter;
    return this;
  }

  public build(): MarkerClusterer {
    const clusterer = new MarkerClusterer(this);
    ClustererHelper.setClusterer(this.pMap, clusterer);
    return clusterer;
  }

  get map() {
    return this.pMap;
  }

  get gridSize() {
    return this.pGridSize ?? GRID_SIZE_DEFAULT;
  }

  get minClusterSize() {
    return this.pMinClusterSize ?? MIN_CLUSTER_SIZE_DEFAULT;
  }

  get maxZoom() {
    return this.pMaxZoom ?? MAX_ZOOM_DEFAULT;
  }

  get className() {
    return this.pClassName ?? CLASS_NAME_DEFAULT;
  }

  get styles() {
    return this.pStyles ?? [];
  }

  get imagePath() {
    return this.pImagePath ?? MARKER_CLUSTER_IMAGE_PATH_DEFAULT;
  }

  get imageExtension() {
    return this.pImageExtension ?? MARKER_CLUSTER_IMAGE_EXTENSION;
  }

  get zoomOnClick() {
    return this.pZoomOnClick ?? true;
  }

  get averageCenter() {
    return this.pAverageCenter ?? true;
  }
}
