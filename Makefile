#!/usr/bin/make -f

NW=$(shell which nw 2>/dev/null)
NWDIR=$(shell echo "$(NW)" | sed -e 's/\/nw$$//')
APPNAME=procgraph
SYSTEM=$(shell uname -m)
OS=$(shell uname -s | tr '[A-Z]' '[a-z]')
VERSION=$(shell grep version package.json | awk '{print $$2}' | tr -d '"' | tr -d ',')
NWFILE=$(APPNAME)-$(VERSION).nw
APPFILE=$(APPNAME)-$(VERSION).$(OS).$(SYSTEM)

build: pkg-linux

pkg-linux: $(NWFILE)
	@[ "x$(NWDIR)" != "x" ] || { echo; echo "could not find nw in path! cannot continue build"; echo; exit 1; }
	cat $(NW) $(NWFILE) > $(APPNAME) && chmod +x $(APPNAME)
	mkdir $(APPFILE)
	mv $(APPNAME) $(APPFILE)/
	cp $(NWDIR)/nw.pak $(NWDIR)/icudtl.dat $(APPFILE)/
	tar cf $(APPFILE).tar $(APPFILE)
	rm -rf $(APPFILE)
	gzip -9 $(APPFILE).tar
	@echo $(APPFILE).tar.gz" created"

pkg-osx: $(NWFILE)
	@[ "x$(NWDIR)" != "x" ] || { echo; echo "could not find nw in path! cannot continue build"; echo; exit 1; }

clean:
	rm -rf tmp/ $(APPNAME) $(APPNAME).* $(APPNAME)-* $(APPFILE)/

$(NWFILE): pack

pack: clean
	mkdir tmp
	rsync -av --exclude='tmp/' --exclude='.*' . tmp/. || echo -n
	rm -rf tmp/tmp
	sed -i -e 's/"toolbar":\s*true,/"toolbar":   false,/' tmp/package.json
	cd tmp && zip -9 -q -r ../$(NWFILE) *
	rm -rf tmp
	@echo "$(NWFILE) created"

nodemodules:
	npm install bootstrap --ca=""
	npm install jquery --ca=""
