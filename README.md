## Proc Graph ##

Proc Graph plots resource usage of a single linux / osx process.

![Graph](resources/screenshots/graph.png)

## Features

 * graph resource usage
 * zooming
 * remote host support via ssh (keys only)

## Downloads

* **v0.2.0**

 * Linux: [32bit](https://github.com/sni/procgraph/releases/download/v0.2.0/procgraph-0.2.0.linux.i686.tar.gz) / [64bit](https://github.com/sni/procgraph/releases/download/v0.2.0/procgraph-0.2.0.linux.x86_64.tar.gz)
 * MacOSX: [64bit](https://github.com/sni/procgraph/releases/download/v0.2.0/procgraph-0.2.0-osx.zip)

* **old releases**

 * can be found in the [github release archive](https://github.com/sni/procgraph/releases)

## Requirements

Currently only linux and osx is supported because top is used to gather the required
data.

 * linux / osx
 * node-webkit
 * npm

## Source Installation

Install bootstrap and jquery via npm:

    %> git clone https://github.com/sni/procgraph.git
    %> cd procgraph
    %> npm install bootstrap
    %> npm install jquery

## Usage

Run with node-webkit

    %> <path to node-webkit>/nw .

## More information

More information can be found on https://github.com/sni/procgraph
