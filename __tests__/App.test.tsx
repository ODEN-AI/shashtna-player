/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', () => {
  // The connection screen rotates posters on timers; drive time manually so
  // the render settles instead of waiting on real intervals.
  jest.useFakeTimers();
  let tree: ReactTestRenderer.ReactTestRenderer | undefined;

  ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  ReactTestRenderer.act(() => {
    jest.advanceTimersByTime(3000);
  });

  expect(tree).toBeDefined();
  ReactTestRenderer.act(() => tree?.unmount());
  jest.useRealTimers();
});
