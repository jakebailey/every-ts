# every-ts

## 2.0.0

### Major Changes

- ab5d9e5: Update minimum node version to v18

## 1.2.4

### Patch Changes

- 685a3ed: Attempt to update local branches on `every-ts fetch`
- c143c42: Ensure repo is cloned before bisect commands are run

## 1.2.3

### Patch Changes

- fcc9b5f: Always reset checkout on bisect reset

## 1.2.2

### Patch Changes

- d4be77f: Fix missing exit codes

## 1.2.1

### Patch Changes

- 713e55f: Add missing --version flag

## 1.2.0

### Minor Changes

- d9a5c3b: Print bisect action during bisect run

### Patch Changes

- 831d1b7: Directly execute fnm instead of using PATH

## 1.1.4

### Patch Changes

- 2069853: Fix node execution on Windows

## 1.1.3

### Patch Changes

- c6bb829: Add extra logging for failed builds
- 8203cd6: Ensure that longpaths are enabled when cloning on Windows

## 1.1.2

### Patch Changes

- a491de0: Fix bin linking on Windows

## 1.1.1

### Patch Changes

- 6e75119: Print a message when TS has been built successfully
- 409dc01: Fix git bisect when repo isn't clean

## 1.1.0

### Minor Changes

- be0ccf6: Add "every-ts dir" to get the repo dir for npm link

### Patch Changes

- b6d28a9: Document "every-ts fetch" and ensure it builds

## 1.0.0

### Major Changes

- e51e137: Initial release
