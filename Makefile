#!/usr/bin/make -f

NW=$(shell which nw 2>/dev/null)
NWDIR=$(shell echo "$(NW)" | sed -e 's/\/nw$$//')
APPNAME=procgraph
NWFILE=$(APPNAME).nw
SYSTEM=$(shell uname -m)
OS=$(shell uname -s | tr '[A-Z]' '[a-z]')
VERSION=$(shell grep version package.json | awk '{print $$2}' | tr -d '"' | tr -d ',')
APPFILE=$(APPNAME)-$(VERSION).$(OS).$(SYSTEM)


build: $(NWFILE)
	@[ "x$(NWDIR)" != "x" ] || { echo; echo "could not find nw in path! cannot continue build"; echo; exit 1; }
	cat $(NW) $(NWFILE) > $(APPNAME) && chmod +x $(APPNAME)
	mkdir $(APPFILE)
	mv $(APPNAME) $(APPFILE)/
	cp $(NWDIR)/nw.pak $(NWDIR)/icudtl.dat $(APPFILE)/
	tar cf $(APPFILE).tar $(APPFILE)
	rm -rf $(APPFILE)
	gzip -9 $(APPFILE).tar
	@echo $(APPFILE).tar.gz" created"

clean:
	rm -rf $(APPNAME) $(APPNAME).* $(APPNAME)-* $(APPFILE)/

$(NWFILE): pack

pack: clean
	rm -rf tmp
	mkdir tmp
	cp -r * tmp || echo -n
	rm -rf tmp/tmp
	sed -i -e 's/"toolbar":\s*true,/"toolbar":   false,/' tmp/package.json
	cd tmp && zip -9 -q -r ../$(NWFILE) *
	rm -rf tmp
	@echo "$(NWFILE) created"

nodemodules:
	npm install bootstrap
	npm install jquery
