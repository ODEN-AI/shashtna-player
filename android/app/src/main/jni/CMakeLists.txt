cmake_minimum_required(VERSION 3.13)

project(appmodules)

# React Native default application CMake configuration.
include(${REACT_ANDROID_DIR}/cmake-utils/ReactNative-application.cmake)

# Explicitly link the Android shared C++ runtime.
target_link_libraries(
    ${CMAKE_PROJECT_NAME}
    c++_shared
)