# Marker Clusterer for Google Maps JavaScript API v3

This is fast marker clustering library. It's working with Google Maps JavaScript API v3 as an alternative to [markerclusterer](https://github.com/googlemaps/v3-utility-library/tree/master/packages/markerclusterer) and [markerclustererplus](https://github.com/googlemaps/v3-utility-library/tree/master/packages/markerclustererplus) libraries from the googlemaps/v3-utility-library package.

## Getting Started

The Marker Clusterer library can be served from the firebase host. Add the following script tag in your html file

    <script src="https://maps-tools-242a6.firebaseapp.com/clusterer/markers/markerclusterer.js">
    </script>

Please note that Marker Clusterer implements a `google.maps.OverlayView` interface, so it must be initialized after the Google Maps JavaScript API v3 is fully loaded.

Typically Google Maps JavaScript API is loaded in asynchronous way as specified in the official documentation

    <script async defer
    src="https://maps.googleapis.com/maps/api/js?key=[YOUR_API_KEY]]&callback=initMap">
    </script>

That means we must include clusterer initialization code inside `initMap()` callback function after map object initialization.

E.g.

    function initMap() {
      var map = new google.maps.Map(document.getElementById('map'), {
        zoom: 12,
        center:  {lat: 41.3850639, lng: 2.1734035}
      });

      MarkerClusterer.getClusterer().then(Clusterer => {
        if (Clusterer) {
          const clusterer = new Clusterer.Builder(map)
              .withMaxZoom(20)
              .build();
          createMarkers(clusterer);
        }
      });
    }

    function createMarkers(clusterer) {
      // TODO add markers to cluster using
      // clusterer.createMarker() method.
    }

Note that clusterer is loaded asynchronously, so the logic should be implemented once `MarkerClusterer.getClusterer()` promise is resolved.

### Setting up clusterer

In order to set up a clusterer you should call `MarkerClusterer.getClusterer()` method that returns a promise. Once resolved the promise you will have a Clusterer class that should be used to create an instance of clusterer object.

Code snippet is the following

    MarkerClusterer.getClusterer().then(Clusterer => {
      if (Clusterer) {
        // TODO: create instance of clusterer
      }
    });

### Create instance of clusterer

In order to create instance of clusterer you must call Builder, the Builder accepts an instance of `google.maps.Map` as a constructor parameter and allows call several chained functions to establish parameters of clusterer.

    const clusterer = new Clusterer.Builder(map)
        .withMaxZoom(20)
        .build();

### Public methods available for chaining in Builder object

    withGridSize(gridSize: number)

    withMinClusterSize(minClusterSize: number)

    withMaxZoom(maxZoom: number)

    withClassName(className: string)

    withStyles(styles: IStyle[])

    withImagePath(imagePath: string)

    withImageExtension(imageExtension: string)

    withZoomOnClick(zoomOnClick: boolean)

    withAverageCenter(averageCenter: boolean)

#### Interface IStyle

This interface is used to style the cluster's icons. There is default implementation of styles, but you can override it applying array of styles in Builder object

    interface IStyle {
      url: string;
      height: number;
      width: number;
      textColor?: string;
      anchor?: number[] | null;
      textSize?: number;
      backgroundPosition?: string;
    }

### Adding markers to clusterer

In order to add markers to the clusterer you should use `createMarker()` method. This method accepts parameter of type `google.maps.MarkerOptions`

    var marker = clusterer.createMarker({
        position: {lat: 41.3850639, lng: 2.1734035},
        map: map,
        title: 'Hello World!'
    });

### Public methods available on clusterer object

    setVisible(v: boolean): void;
    getTotalClusters(): number;
    getClustererBounds(): google.maps.LatLngBounds;
    getMarkersBounds(): google.maps.LatLngBounds;
    getExtendedBounds(bounds: google.maps.LatLngBounds): google.maps.LatLngBounds;
    redraw(): void;
    destroy(): void;
    createMarker(options: google.maps.MarkerOptions): google.maps.Marker;
    clearMarkers(): void;

## Demo

The live demo is available at [https://maps-tools-242a6.firebaseapp.com/clusterer/demos/markerclusterer.html](https://maps-tools-242a6.firebaseapp.com/clusterer/demos/markerclusterer.html)

AngularJS example is available at [Plunker](http://next.plnkr.co/edit/jw6Bkvt0pPkq0E4z)

## Licence

The source code of this library is licensed under the MIT License.
