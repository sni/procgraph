# Proc Graph #

Proc Graph plots memory and cpu resource usage of linux / osx process(es) based on top data.

![Graph](resources/screenshots/graph.png)

## Features

 * plots resource usage (regular expression filter possible)
 * graph supports zooming and draggable legend
 * remote host support via ssh (keys only)
 * import / export gathered data in json format

## Downloads

Use these stable binary releases if in doubt. Source installations are available below for developers.

* **v0.3.0**

 * Linux: [32bit](https://github.com/sni/procgraph/releases/download/v0.3.0/procgraph-0.3.0.linux.i686.tar.gz) / [64bit](https://github.com/sni/procgraph/releases/download/v0.3.0/procgraph-0.3.0.linux.x86_64.tar.gz)
 * MacOSX: [64bit](https://github.com/sni/procgraph/releases/download/v0.3.0/procgraph-0.3.0-osx.zip)

* **old releases**

 * can be found in the [github release archive](https://github.com/sni/procgraph/releases)


## Source Installation

### Requirements

Currently only linux and osx is supported because top is used to gather the required
data.

 * linux / osx
 * node-webkit
 * npm

### Install dependencies

Install bootstrap and jquery via npm:

    %> git clone https://github.com/sni/procgraph.git
    %> cd procgraph
    %> npm install

### Start

Run with node-webkit

    %> <path to node-webkit>/nw .

On osx the nw binary is called 'node-webkit'.

    %> /Applications/node-webkit-v0.8.6-osx-ia32/Contents/MacOS/node-webkit .

## More information

More information can be found on https://github.com/sni/procgraph
