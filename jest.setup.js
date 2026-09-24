/* Native modules are unavailable under Jest; provide inert stand-ins. */

jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: {
    fs: {
      dirs: { DocumentDir: '/tmp' },
      exists: jest.fn(async () => false),
      readFile: jest.fn(async () => ''),
      writeFile: jest.fn(async () => undefined),
      unlink: jest.fn(async () => undefined),
    },
    config: jest.fn(() => ({ fetch: jest.fn() })),
    fetch: jest.fn(),
  },
}));

jest.mock('react-native-video', () => {
  const React = require('react');
  const { View } = require('react-native');
  const Video = React.forwardRef((props, _ref) => React.createElement(View, props));
  return { __esModule: true, default: Video, SelectedTrackType: {}, SelectedVideoTrackType: {} };
});

jest.mock('@react-native-vector-icons/ionicons/static', () => {
  const React = require('react');
  const { Text } = require('react-native');
  return { Ionicons: props => React.createElement(Text, null, props.name) };
});
