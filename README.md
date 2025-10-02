# Proc Graph

Proc Graph plots memory and cpu resource usage of Linux / OSX process(es) based on top data.

![Graph](resources/screenshots/graph.png)

## Features

* plots resource usage (regular expression filter possible)
* graph supports zooming and draggable legend
* remote host support via ssh (keys only)
* import / export gathered data in json format

## Downloads

Use these stable binary releases if in doubt. Source installations are available below for developers.

* **v0.3.1**

* Linux: [32bit](https://github.com/sni/procgraph/releases/download/v0.3.1/procgraph-0.3.1.linux.i686.tar.gz) / [64bit](https://github.com/sni/procgraph/releases/download/v0.3.1/procgraph-0.3.1.linux.x86_64.tar.gz)
* MacOSX: [64bit](https://github.com/sni/procgraph/releases/download/v0.3.1/procgraph-0.3.1.dmg)

* **old releases**

* can be found in the [github release archive](https://github.com/sni/procgraph/releases)

## Usage

Unpack the tarball from the download section and run the binary:

```bash
%> ./procgraph
```

On OSX you just need to start the application.

## Source Installation

### Requirements

Currently only linux and osx is supported because top is used to gather the required
data.

* Linux / OSX
* [NWJS](https://nwjs.io/)
* NPM

### Install dependencies

Install bootstrap and jquery via npm:

```bash
%> git clone https://github.com/sni/procgraph.git
%> cd procgraph
%> npm install
```

### Start

Run with node-webkit

```bash
%> <path to node-webkit>/nw .
```

On OSX the nw binary is called 'node-webkit'.

```bash
%> /Applications/node-webkit-v0.8.6-osx-ia32/Contents/MacOS/node-webkit .
```

## More information

More information can be found on <https://github.com/sni/procgraph>
