/* Native modules are unavailable under Jest; provide inert stand-ins. */

jest.mock('react-native-blob-util', () => {
  // In-memory file system so persistence code can be exercised in tests.
  const files = new Map();
  const fs = {
    __files: files,
    dirs: { DocumentDir: '/docs' },
    exists: jest.fn(async path => files.has(path)),
    readFile: jest.fn(async path => {
      if (!files.has(path)) throw new Error(`ENOENT ${path}`);
      return files.get(path);
    }),
    writeFile: jest.fn(async (path, data) => {
      files.set(path, data);
    }),
    unlink: jest.fn(async path => {
      files.delete(path);
    }),
    mv: jest.fn(async (from, to) => {
      files.set(to, files.get(from));
      files.delete(from);
      return true;
    }),
  };
  return {
    __esModule: true,
    default: { fs, config: jest.fn(() => ({ fetch: jest.fn() })), fetch: jest.fn() },
  };
});

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
