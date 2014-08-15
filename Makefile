#!/usr/bin/make -f

NW=$(shell which nw 2>/dev/null)
NWDIR=$(shell echo "$(NW)" | sed -e 's/\/nw$$//')
NWOSX=$(shell which node-webkit 2>/dev/null)
NWOSXDIR=$(shell echo "$(NWOSX)" | sed -e 's/\/node-webkit$$//')/../../
APPNAME=procgraph
SYSTEM=$(shell uname -m)
OS=$(shell uname -s | tr '[A-Z]' '[a-z]')
VERSION=$(shell grep version package.json | awk '{print $$2}' | tr -d '"' | tr -d ',')
GITREF=$(shell git log -1 --no-color --pretty=format:%h)
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
	@[ "x$(NWOSXDIR)" != "x" ] || { echo; echo "could not find node-webkit in path! cannot continue build"; echo; exit 1; }
	mkdir $(APPNAME)
	rsync -a $(NWOSXDIR)/. $(APPNAME)/.
	rsync -a $(NWFILE) $(APPNAME)/Contents/Resources/app.nw
	cat resources/Info.plist | sed -e 's/###VERSION###/$(VERSION)/' | sed -e 's/###GITREF###/$(GITREF)/' > $(APPNAME)/Contents/Info.plist
	cp resources/nw.icns $(APPNAME)/Contents/Resources/nw.icns
	mv $(APPNAME) $(APPNAME)-$(VERSION)
	mkdir $(APPNAME)
	cp -rp $(APPNAME)-$(VERSION) $(APPNAME)
	zip -9 -q -r $(APPNAME)-$(VERSION)-osx.zip $(APPNAME)
	rm -rf $(APPNAME)

clean:
	rm -rf tmp/ $(APPNAME) $(APPNAME).* $(APPNAME)-* $(APPFILE)/

$(NWFILE): pack

pack: clean
	mkdir tmp
	rsync -a --exclude='tmp/' --exclude='.*' . tmp/. || echo -n
	rm -rf tmp/tmp
	cat package.json | sed -e 's/"toolbar":\ *true,/"toolbar":   false,/' > tmp/package.json
	cd tmp && zip -9 -q -r ../$(NWFILE) *
	rm -rf tmp
	@echo "$(NWFILE) created"

nodemodules:
	npm install bootstrap --ca=""
	npm install jquery --ca=""
