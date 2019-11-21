import getDataLayerClustererClass from '../index';
test('Clusterer class', () => {
  expect(getDataLayerClustererClass(google.maps.OverlayView)).toBeUndefined();
});
