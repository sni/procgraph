var sys     = require('sys')
var fs      = require('fs');
var child   = require('child_process');
var spawn   = child.spawn;
var exec    = child.exec;
var gui     = require('nw.gui');
var win     = gui.Window.get();
var version = gui.App.manifest.version

/* precompiled regular expressions */
var topStartRegexp1 = new RegExp(/^\s*top\s*/);
var topStartRegexp2 = new RegExp(/^Processes:/);
var lineBreakRegexp = new RegExp(/\n+/g);
var procStartRegexp = new RegExp(/^\s*PID\s+USER/);

/* do everything needed to startup */
function init() {
  $('#version').text('v'+version);

  /* add eventhandler for clear button */
  $("#proctablefilterclear").click(function() {
    $("#proctablefilter").val('');
    refilterTopTable('');
  });
  $("#sshbtn").click(function() {
    $("#proctable td").parent().remove();
    if($('#sshbtn').text() == "disconnect") {
      $('#sshhost').val('');
      $('#sshbtn').text('connect');
    }
    spawnTop(updateTopTable);
  });

  /* add eventhandler for input field */
  $("#proctablefilter").keyup(function() {
    refilterTopTable($("#proctablefilter").val());
  });

  $("#backimg").click(function() {
    if(topChild) { console.log("stoping "+topChild.pid); topChild.kill(); topChild = false; }
    lastPid    = undefined;
    lastFilter = undefined;
    $('#graphtable').hide();
    $('#backimg').hide();
    $("#tooltip").hide();
    $("#proctable td").parent().remove();
    $('#procpanel').show();
    $('#controlbtngrp').css({display: 'none'});
    $('#exportbtn').addClass('disabled');
    $('#exportFileDialog').attr('disabled', true);
    spawnTop(updateTopTable, undefined, undefined, undefined, true);
  });

  $("#filterbtn").click(function() {
    startGraphing(undefined, $("#proctablefilter").val());
  });

  /* Fix input element click problem */
  $('.dropdown input, .dropdown label').click(function(e) {
    e.stopPropagation();
  });

  win.on('resize', function() {
    if(lastPid || lastFilter) {
      redrawRequired = true;
      drawVisibleSeries();
    }
  });

  /* clean up */
  win.on('close', function() {
    /* make sure all top processes are done */
    child = exec('ps -efl | grep top | grep '+process.pid+' | awk \'{ print $1 }\' | xargs kill');
    this.close(true);
  });

  $("#stopbtn").click(function() {
    if(topChild) { console.log("stoping "+topChild.pid); topChild.kill(); topChild = false; }
    $("#stopbtn").addClass('active');
    $("#pausebtn").removeClass('active');
    $("#playbtn").removeClass('active');
    resetData();
  });
  $("#pausebtn").click(function() {
    if($("#playbtn").hasClass('active')) {
      if($("#pausebtn").hasClass('active')) {
        $("#pausebtn").removeClass('active');

        var date      = new Date();
        var timestamp = date.getTime();
        rawdata[0].push([timestamp, undefined]); // virt
        rawdata[1].push([timestamp, undefined]); // res
        rawdata[2].push([timestamp, undefined]); // shr
        rawdata[3].push([timestamp, undefined]); // cpu
        rawdata[4].push([timestamp, undefined]); // matches

        startGraphing(lastPid, lastFilter);
      } else {
        $("#pausebtn").addClass('active');
        if(topChild) { console.log("stoping "+topChild.pid); topChild.kill(); topChild = false; }
        var date      = new Date();
        var timestamp = date.getTime();
        rawdata[0].push([timestamp, undefined]); // virt
        rawdata[1].push([timestamp, undefined]); // res
        rawdata[2].push([timestamp, undefined]); // shr
        rawdata[3].push([timestamp, undefined]); // cpu
        rawdata[4].push([timestamp, undefined]); // matches
      }
    } else {
      if(topChild) { console.log("stoping "+topChild.pid); topChild.kill(); topChild = false; }
      $("#stopbtn").removeClass('active');
      $("#pausebtn").addClass('active');
      $("#playbtn").addClass('active');
    }
  });
  $("#playbtn").click(function() {
    if($("#pausebtn").hasClass('active')) {
      $("#pausebtn").click();
    } else {
      startGraphing(lastPid, lastFilter);
      $("#playbtn").addClass('active');
      $("#stopbtn").removeClass('active');
      $("#pausebtn").removeClass('active');
    }
  });

  console.log(gui.App.argv);
  if(gui.App.argv.length > 0) {
    var val = gui.App.argv[0];
    if(String(val).match(/^\d+$/)) {
      startGraphing(val);
    } else {
      $("#proctablefilter").val(val);
      startGraphing(undefined, val);
    }
  } else {
    spawnTop(updateTopTable, undefined, undefined, undefined, true);
  }
  return;
}

/* filter top output */
function refilterTopTable(filter) {
  var pattern;
  if(filter) { pattern = new RegExp(filter, 'i'); }
  $('#proctable tbody tr').each(function(i, row) {
    var line = row.getAttribute('alt');
    if(line) {
      if(!pattern || line.match(pattern)) {
        row.style.display = '';
      } else {
        row.style.display = 'none';
      }
    }
  });
}

function updateTopTable(data) {
  var filter = $('#proctablefilter').val();
  var pattern;
  if(filter) { pattern = new RegExp(filter, 'i'); }

  // empty table first
  $("#proctable td").parent().remove();
  for(var i=0, len=data.length; i<len; i++) {
    var row = data[i];
    var display = (!pattern || row.line.match(pattern)) ? '' : 'none';
    $('#proctable tbody').append('<tr class="clickable" onclick="startGraphing('+row.pid+')" alt="'+row.line+'" style="display:'+display+';">'
                                  +'<td class="pid">'+row.pid+'</td>'
                                  +'<td class="user">'+row.user+'</td>'
                                  +'<td class="pr">'+row.pr+'</td>'
                                  +'<td class="ni">'+row.ni+'</td>'
                                  +'<td class="virt">'+row.virt+'</td>'
                                  +'<td class="res">'+row.res+'</td>'
                                  +'<td class="shr">'+row.shr+'</td>'
                                  +'<td class="s">'+row.s+'</td>'
                                  +'<td class="cpu">'+row.cpu+'</td>'
                                  +'<td class="mem">'+row.mem+'</td>'
                                  +'<td class="time">'+row.time+'</td>'
                                  +'<td class="command">'+row.command+'</td>'
                                  +'</tr>');
  }
  $.bootstrapSortable(true);
}

/* parse single line from top output */
var lastOutput = '';
function parseTopOutputStream(streamdata, callback, force) {
  if(lastOutput == '' || !(force || streamdata.match(topStartRegexp1) || streamdata.match(topStartRegexp2))) {
    lastOutput += streamdata;
    return;
  }
  var procStarted  = false;
  var currentProcs = [];
  var lines        = lastOutput.split(lineBreakRegexp);
  lastOutput       = streamdata;
  for(var i=0, len = lines.length; i<len; i++) {
    var line = lines[i];
    if(line.match(topStartRegexp1) || line.match(topStartRegexp2)) {
      var procStarted = false;
      var currentProcs = [];
    }
    line = line.trim();
    var data = line.split(/\s+/g);
    if(procStarted) {
      var hash = {};
      if(curSyntax == 0) {
        if(!data[11]) { continue; }
        hash.line    = line;
        hash.pid     = data.shift();
        hash.user    = data.shift();
        hash.pr      = data.shift();
        hash.ni      = data.shift();
        hash.virt    = normalizeMemVal(data.shift(), line);
        hash.res     = normalizeMemVal(data.shift(), line);
        hash.shr     = normalizeMemVal(data.shift(), line);
        hash.s       = data.shift();
        hash.cpu     = data.shift();
        hash.mem     = data.shift();
        hash.time    = data.shift();
        hash.command = data.join(' ');
        currentProcs.push(hash);
      }
      if(curSyntax == 1) {
        if(!data[6]) { continue; }
        hash.line    = line;
        hash.pid     = Number(String(data.shift()).replace(/\-$/, ''));
        hash.user    = data.shift();
        hash.pr      = '';
        hash.ni      = '';
        hash.s       = data.shift();
        hash.cpu     = data.shift();
        hash.res     = normalizeMemVal(data.shift(), line);
        hash.time    = data.shift();
        hash.virt    = '';
        hash.shr     = '';
        hash.mem     = '';
        hash.command = data.join(' ');
        currentProcs.push(hash);
      }
      if(hash.cpu > 10000) {
        console.log("skipped broken cpu value in");
        console.log(line);
        return;
      }
    }
    if(line.match(procStartRegexp)) {
      procStarted  = true;
    }
  }
  callback(currentProcs);
  return;
}

/* start new top child with updated interval */
function updateInterval() {
  if(!topChild) { return; }
  spawnTop(lastCallback, lastPid, curSyntax, lastFilter);
}

var topChild = false, curSyntax = 0, lastCallback = false;
function spawnTop(callback, pid, altSyntax, filter, oneShot) {
  $('#sshbtn').text('connect');
  if(topChild) { console.log("stoping "+topChild.pid); topChild.kill(); topChild = false; }
  if(altSyntax == undefined) { altSyntax = 0; }
  curSyntax    = altSyntax;
  lastCallback = callback;

  var standardArgs = ['-b', '-c'];
  if(altSyntax == 1) {
    /* osx top is crappy */
    standardArgs = ['-l', '0', '-stats', 'pid,user,state,cpu,mem,time,command', '-F', '-R' ];
  }

  var ssh     = $("#sshhost").val(),
      command = false,
      args    = [],
      options = {},
      fullcmd = '';
  if(ssh) {
    /* remote top */
    $('#sshbtn').text('disconnect');
    args    = [ ssh, '-o', 'BatchMode=yes', '-o', 'Compression=yes', '-o', 'CompressionLevel=9', 'COLUMNS=300 top'];
    command = 'ssh';
  } else {
    /* local top */
    command = 'top';
    options = {env: {'COLUMNS': 300}};
  }
  args = args.concat(standardArgs);

  var interval;
  if(pid || filter) {
    interval = $('#intervalinput').val();
    if(interval < 0.1) { interval = 0.1; }
  }

  if(altSyntax == 0) {
    if(interval) { args.push('-d', interval); }
    if(pid)      { args.push('-p', pid); }
  }
  if(altSyntax == 1) {
    interval = Math.round(interval); /* only supports integer */
    if(interval) { args.push('-i', (interval < 1 ? 1 : interval)); }
    if(pid)      { args.push('-pid', pid); }
  }

  lastOutput = '';
  fullcmd    = command+' '+args.join(' ');

  /* run top once for faster initial display */
  if(oneShot) {
    var extra = ' -n1';
    if(altSyntax == 1) {
      extra = ' -l1';
    }
    child = exec(fullcmd+" "+extra, options, function(error, stdout, stderr) {
      parseTopOutputStream(stdout, callback);
    });
  }

  lastOutput = '';
  topChild   = spawn(command, args, options);
  console.log("spawned["+topChild.pid+"]: "+fullcmd);
  if(!topChild) {
    console.log("failed to launch top");
    topChild = false;
    return;
  }
  topChild.stdout.setEncoding('utf8');
  topChild.stdout.on('data', function (data) {
    //console.log('stdout: ' + data);
    parseTopOutputStream(data.toString(), callback);
  });
  topChild.stderr.on('data', function (data) {
    if(data.toString().match(/invalid option or syntax/)) {
      spawnTop(callback, pid, ++altSyntax, filter);
      return;
    }
    console.log('stderr: ' + data);
    $("#proctable td").parent().remove();
    $('#proctable tbody').append('<tr>'
                                +'<td colspan=12><pre class="error">%>'+fullcmd+'<br>'+data+'</pre></td>'
                                +'</tr>');
  });
  topChild.on('close', function (code) {
    if(code != 0) {
      console.log('['+this.pid+'] child process exited with code ' + code);
    }
  });
}

function showGraph() {
  $('#procpanel').hide();
  $('#graphtable').show();
  $('#backimg').show();
  $('#controlbtngrp').css({display: 'block'});
  $('#playbtn').addClass('active');
  $('#exportbtn').removeClass('disabled');
  $('#exportFileDialog').attr('disabled', false);
}

var plot, series, graph_interval, lastPid, lastFilter;
var graphVisibility = { virt: true, res: true, shr: true, cpu: true, matches: true };
var rawdata = [[],[],[],[],[]];
var isZoomed = false;
function startGraphing(pid, filter, graphOnly) {
  showGraph();
  redrawRequired = true;

  $("#stopbtn").removeClass('active');
  $("#pausebtn").removeClass('active');
  $("#playbtn").addClass('active');
  if(graphOnly) {
    $("#stopbtn").addClass('active');
    $("#pausebtn").removeClass('active');
    $("#playbtn").removeClass('active');
  }
  var reset = false;
  if(pid && (lastPid == undefined || lastPid != pid)) {
    reset = true;
  }
  if(filter != undefined && (lastFilter == undefined || lastFilter != filter)) {
    reset = true;
  }
  if(reset) {
    // reset series
    reset           = false;
    resetData();
  }
  lastPid    = pid;
  lastFilter = filter;

  var s1 = {
    nr:    0,
    label: "virt",
    color: "#edc240",
    data: rawdata[0],
    yaxis: 2
  };
  var s2 = {
    nr:    1,
    label: "res",
    color: "#afd8f8",
    data: rawdata[1],
    yaxis: 2
  };
  var s3 = {
    nr:    2,
    label: "shr",
    color: "#cb4b4b",
    data: rawdata[2],
    yaxis: 2
  };
  var s4 = {
    nr:    3,
    label: "cpu",
    color: "#4da74d",
    data: rawdata[3]
  };
  var s5 = {
    nr:    4,
    label: "matches",
    color: "#9440ed",
    data: rawdata[4]
  };
  var options = {
    xaxis: { mode: "time",
             timezone: "browser"
    },
    yaxes: [ { // left cpu axis
               min: 0,
               max: 100,
               tickFormatter: function(val, axis) { return(val < axis.max ? val+"%" : "CPU"); }
              },
              { // right size axis
               min: 0,
               position: "right",
               alignTicksWithAxis: 1,
               tickFormatter: function(val, axis) { return(val < axis.max ? formatKiB(val) : "MEM"); }
              }
          ],
    grid: {
      hoverable: true,
    },selection: {
      mode: "x"
    },
    legend: {
      position: 'ne',
      margin: [10, 40]
    }
  };
  series = [s1, s2, s3, s4, s5];
  plot = $.plot('#procgraph', [], options);
  redrawRequired = true;
  if(!graphOnly) {
    updateGraph(pid, filter);
  }

  /* graph hover */
  $("#procgraph").bind("plothover", function (event, pos, item) {
    if (item) {
      var x = new Date(item.datapoint[0]),
          y = item.datapoint[1];

      var val;
      if(item.series.label == 'cpu') {
        val = y.toFixed(1)+'%';
      } else if(item.series.label == 'matches') {
        val = '#' + y;
      } else {
        val = formatKiB(y);
      }

      $("#tooltip").html(x + ": " + item.series.label + " = " + val)
                   .css({top: item.pageY+5, left: item.pageX+5})
                   .fadeIn(200);
    } else {
      $("#tooltip").stop(true).hide();
    }
  });

  /* enable zooming */
  $("#procgraph").bind("plotselected", function (event, ranges) {
    isZoomed = true;
    $.each(plot.getXAxes(), function(_, axis) {
      var opts = axis.options;
      opts.min = ranges.xaxis.from;
      opts.max = ranges.xaxis.to;
    });

    redrawRequired = true;
    drawVisibleSeries();
    plot.clearSelection();
  });
  /* reset zoom on rightclick */
  $("#procgraph").bind("contextmenu", function (event, pos, item) {
    zoomOut()
  });
}

function zoomOut() {
  isZoomed = false;
  $.each(plot.getXAxes(), function(_, axis) {
    var opts = axis.options;
    opts.min = undefined;
    opts.max = undefined;
  });
  redrawRequired = true;
  drawVisibleSeries();
}

function resetData() {
    rawdata         = [[],[],[],[],[]];
    graphVisibility = { virt: true, res: true, shr: true, cpu: true, matches: true };
    duplicateData   = false;
}

/* normalize memory value */
function normalizeMemVal(val, line) {
  var m;

  /* osx style */
  m = String(val).match(/^[\+\-]?(\d+)([A-Z])[\+\-]?$/);
  if(m) {
    val = Number(m[1]);
    if(m[2] == 'M') { val = val * 1024; }
    if(m[2] == 'G') { val = val * 1024 * 1024; }
  }

  /* linux style */
  m = String(val).match(/^([\d\.]+)([a-z])$/);
  if(m && m[1]) {
    val = Number(m[1]);
    if(m[2] == 'm') { val = val * 1024; }
    if(m[2] == 'g') { val = val * 1024 * 1024; }
  }
  if(!String(val).match(/^[\d\.]*$/)) {
    throw new Error("normalizeMemVal: cannot handle: "+val+"\n"+line);
  }
  return(val);
}

/* format KiB value to human readable */
function formatKiB(val) {
  val = val * 1024;
  // value is in KiB initially
  if(val > 1073741824)
    return (val / 1073741824).toFixed(1) + " GB";
  else if (val > 1048576)
    return (val / 1048576).toFixed(0) + " MB";
  else if (val > 1024)
    return (val / 1024).toFixed(0) + " KB";
  return val.toFixed(0) + " B";
}

var redraws = 0;
function updateGraph(pid, filter) {
  redraws = 0;
  spawnTop(graphTopOutput, pid, undefined, filter);
}

function graphTopOutput(data) {
  var date      = new Date();
  var timestamp = date.getTime();
  var redraw    = false;
  var len       = data.length;

  if(len == 0) {
  /* reset details table */
    var keys = ['user', 'prio', 'nice', 'virt', 'res', 'shr', 's', 'cpu', 'mem', 'time'];
    $(keys).each(function(i, key) {
      $('#'+key).html('');
    });
  }

  if(len == 1) {
    /* single process */
    var row = data[0];

    /* add real data */
    rawdata[0].push([timestamp, row.virt]); // virt
    rawdata[1].push([timestamp, row.res ]); // res
    rawdata[2].push([timestamp, row.shr ]); // shr
    rawdata[3].push([timestamp, row.cpu ]); // cpu

    var ssh = $("#sshhost").val();
    $('#pid').html(row.pid+(ssh ? ' (on '+ssh+')' : ''));
    $('#user').html(row.user);
    $('#prio').html(row.pr);
    $('#nice').html(row.ni);
    $('#virt').html(formatKiB(row.virt)+" ("+row.virt+"KiB)");
    $('#res').html(formatKiB(row.res)+" ("+row.res+"KiB)");
    $('#shr').html(formatKiB(row.shr)+" ("+row.shr+"KiB)");
    $('#s').html(row.s);
    $('#cpu').html(row.cpu+" %");
    $('#mem').html(row.mem+" %");
    $('#time').html(row.time);
    $('#command').html(row.command);

    if(redraws < 10) {
      /* show required rows */
      var keys = ['pid', 'user', 'prio', 'nice', 's', 'mem', 'time', 'command', 'virt', 'shr'];
      $(keys).each(function(i, key) {
        $('#'+key).parent().show();
      });
      var keys = ['filter'];
      if(curSyntax == 1) { keys = keys.concat(['virt', 'shr', 'prio', 'nice', 'mem']); }
      $(keys).each(function(i, key) {
        $('#'+key).parent().hide();
      });
    }

    redraw = true;
  }
  else if(lastFilter != undefined) {
    /* multiple processes */
    var pattern = new RegExp(lastFilter, 'i');
    /* count totals */
    var virt = 0, res = 0, shr = 0, cpu = 0, num = 0;
    for(var i=0; i<len; i++) {
      var row = data[i];
      if(row.line.match(pattern)) {
        virt += Number(row.virt);
        res  += Number(row.res);
        shr  += Number(row.shr);
        cpu  += Number(row.cpu);
        num++;
      }
    }

    /* add real data */
    rawdata[0].push([timestamp, virt]); // virt
    rawdata[1].push([timestamp, res ]); // res
    rawdata[2].push([timestamp, shr ]); // shr
    rawdata[3].push([timestamp, cpu ]); // cpu
    rawdata[4].push([timestamp, num ]); // matches

    $('#filter').html(lastFilter+' ('+num+' matches)');
    $('#virt').html(formatKiB(virt)+" ("+virt+"KiB)");
    $('#res').html(formatKiB(res)+" ("+res+"KiB)");
    $('#shr').html(formatKiB(shr)+" ("+shr+"KiB)");
    $('#cpu').html(cpu.toFixed(0)+" %");

    /* hide not required rows */
    if(redraws < 10) {
      var keys = ['pid', 'user', 'prio', 'nice', 's', 'mem', 'time', 'command'];
      if(curSyntax == 1) { keys = keys.concat(['virt', 'shr']); }
      $(keys).each(function(i, key) {
        $('#'+key).parent().hide();
      });
      /* show required rows */
      var keys = ['filter'];
      $(keys).each(function(i, key) {
        $('#'+key).parent().show();
      });
    }

    redraw = true;
  }

  /* slow down graph updates on long running graphs */
  if(redraw) {
    redraws++;
    if(     redraws < 1800) {}
    else if(redraws < 1800 && redraws %  2 != 0) { redraw = false; }
    else if(redraws < 3600 && redraws %  3 != 0) { redraw = false; }
    else if(redraws < 7200 && redraws %  5 != 0) { redraw = false; }
    else if(redraws > 7200 && redraws % 10 != 0) { redraw = false; }
  }

  if(redraw || isZoomed) {
    /* check series visibility */
    drawVisibleSeries();
  }
}

var lastMemDataMax;
function adjustCpuAxisMaxValue() {
  var newmax = Math.ceil(plot.getYAxes()[0].datamax / 100)*100;
  if(newmax < 100) { newmax = 100; }
  if(plot.getOptions().yaxes[0].max != newmax) {
    redrawRequired = true;
    plot.getOptions().yaxes[0].max=newmax;
  }
  /* check other axis too */
  if(lastMemDataMax != plot.getYAxes()[1].datamax) {
    lastMemDataMax = plot.getYAxes()[1].datamax;
    redrawRequired = true;
  }
}

/* draw visible series */
var duplicateData  = false;
var redrawRequired = true;
function drawVisibleSeries() {
  var last = rawdata[3].length - 1;
  if(last < 0) { return; }

  /* adjust cpu axis */
  adjustCpuAxisMaxValue();

  var curSeries = [series[0], series[1], series[2], series[3], series[4]];
  if(duplicateData && !isZoomed) {
    curSeries[0].data.push(rawdata[0][last]);
    curSeries[1].data.push(rawdata[1][last]);
    curSeries[2].data.push(rawdata[2][last]);
    curSeries[3].data.push(rawdata[3][last]);
    curSeries[4].data.push(rawdata[4][last]);
  }
  var timestamp  = rawdata[3][last][0];
  var nextminute = timestamp - timestamp % 60000 + 60000;
  if(last < 2) {
    redrawRequired = true;
  }
  else if(last > 1) {
    var lasttimestamp  = rawdata[3][last-1][0];
    var lastminute     = lasttimestamp - lasttimestamp % 60000 + 60000;
    if(lastminute != nextminute) {
      redrawRequired = true;
    }
  }
  if(!graphVisibility['virt'])    { curSeries[0] = { label: "virt",    color: '#FFFFFF', data: [[nextminute, undefined]] }; }
  if(!graphVisibility['res'])     { curSeries[1] = { label: "res",     color: '#FFFFFF', data: [] }; }
  if(!graphVisibility['shr'])     { curSeries[2] = { label: "shr",     color: '#FFFFFF', data: [] }; }
  if(!graphVisibility['cpu'])     { curSeries[3] = { label: "cpu",     color: '#FFFFFF', data: [] }; }
  if(!graphVisibility['matches']) { curSeries[4] = { label: "matches", color: '#FFFFFF', data: [] }; }

  /* hide virt and shared on osx */
  if(curSyntax == 1) {
    curSeries = [curSeries[1], curSeries[3], curSeries[4]];
  }

  if(lastFilter == undefined) {
    curSeries.pop();
  }

  /* reduce points to plot */
  var factor = 2;
  var num = Math.ceil(curSeries[0].data.length / plot.width()*factor);
  if(num > 1 && !isZoomed) {
    duplicateData = true;
    num = Math.ceil(rawdata[0].length / plot.width() * factor);
    for(var i=0, len=curSeries.length; i<len; i++) {
      curSeries[i].data = reducePoints(rawdata[curSeries[i].nr], num);
    }
  }
  if(isZoomed) {
    for(var i=0, len=curSeries.length; i<len; i++) {
      curSeries[i].data = rawdata[curSeries[i].nr];
    }
  }

  /* advance to next minute to remove flickering */
  if(curSeries[0] && curSeries[0].data) {
    curSeries[0].data.push([nextminute, undefined]);
  }

  plot.setData(curSeries);
  if(redrawRequired) {
    try {
      plot.resize();
      plot.setupGrid();
      setupLegendEvents();
    } catch(e) {}
    redrawRequired = false;
  }
  plot.draw();

  /* remove pseudo entry */
  if(curSeries[0] && curSeries[0].data) {
    curSeries[0].data.pop();
  }

  return(curSeries);
}

function setupLegendEvents() {
  /* make legend boxes clickable */
  $('.legendColorBox').click(function() {
    graphVisibility[this.nextSibling.innerHTML] = !graphVisibility[this.nextSibling.innerHTML];
    drawVisibleSeries();
    adjustCpuAxisMaxValue();
    redrawRequired = true;
    drawVisibleSeries();
  }).addClass("clickable");
  $('TD.legendLabel').css({paddingLeft: "5px"});

  /* make legend draggable*/
  var table  = $(".legend TABLE", plot.getPlaceholder()).first().attr('draggable', true)[0];
  table.ondragstart = function(e) {
    dragStart = {x: e.screenX-e.offsetX, y: e.screenY+(e.target.offsetHeight-e.offsetY)};
  };
  table.ondragend   = function(e) {
    dragEnd = {x: e.screenX, y: e.screenY};
    e.preventDefault();
    var deltaX = dragEnd.x - dragStart.x;
    var deltaY = dragEnd.y - dragStart.y;
    var old = plot.getOptions().legend.margin;
    plot.getOptions().legend.margin = [old[0]-deltaX, old[1]+deltaY];
    plot.setupGrid();
    setupLegendEvents();
  };
  document.body.ondragover = function(e) {
    e.preventDefault();
    return false;
  };
}

function reducePoints(listIn, num) {
  var listOut = [listIn[0]];
  var sumA = 0, sumB = 0, count = 0;
  for(var i=1, len=listIn.length; i<len; i++) {
    if(listIn[i][1] == undefined) {
      if(i > 0 && listIn[i-1][1] != undefined) {
        /* only need to save the first/last undefined value */
        listOut.push([listIn[i][0], undefined]);
      }
      else if(listIn[i+1] == undefined || listIn[i+1][1] != undefined) {
        listOut.push([listIn[i][0], undefined]);
      }
    } else {
      sumA += Number(listIn[i][0]);
      sumB += Number(listIn[i][1]);
      count++;
      if(count == num) {
        listOut.push([Math.round(sumA/count), Math.round(sumB/count)]);
        sumA = 0, sumB = 0, count = 0;
      }
    }
  }
  if(count > 0) {
    listOut.push([Math.round(sumA/count), Math.round(sumB/count)]);
  }
  return(listOut);
}

function chooseFile(name, callback) {
  var chooser = $(name);
  chooser.change(function(evt) {
    var val = $(this).val();
    if(val != "") {
      callback($(this).val());
    }
    $(this).val('');
  });
  chooser.trigger('click');
}

function loadData(file) {
  console.log('loading:'+file);
  fs.readFile(file, function (err, content) {
    if(err) {
      alert("loading "+file+" failed: "+err);
    } else {
      var data = {};
      try {
        var data = JSON.parse(content.toString());
      } catch(e) {}
      if(data.data) {
        if(topChild) { console.log("stoping "+topChild.pid); topChild.kill(); topChild = false; }
        lastPid    = data.lastPid;
        lastFilter = data.lastFilter;
        rawdata    = data.data;

        var last      = rawdata[3].length - 1;
        var timestamp = rawdata[3][last][0]+1;
        rawdata[0].push([timestamp, undefined]); // virt
        rawdata[1].push([timestamp, undefined]); // res
        rawdata[2].push([timestamp, undefined]); // shr
        rawdata[3].push([timestamp, undefined]); // cpu
        rawdata[4].push([timestamp, undefined]); // matches

        startGraphing(lastPid, lastFilter, true);
        zoomOut();
      }
    }
  });
}

function saveData(file) {
  console.log('saving '+file);
  var data = JSON.stringify({lastPid: lastPid, lastFilter: lastFilter, data: rawdata});
  fs.writeFile(file, data, function(err) {
      if(err) {
        alert("saving "+file+" failed: "+err);
      }
  });
}

/* support opening external urls in default browser */
function supportExternalLinks(event) {
  var href;
  var isExternal = false;
  function crawlDom(element) {
    if (element.nodeName.toLowerCase() === 'a') {
      href = element.getAttribute('href');
    }
    if (element.classList.contains('js-external-link')) {
      isExternal = true;
    }
    if (href && isExternal) {
      gui.Shell.openExternal(href);
      event.preventDefault();
    } else if (element.parentElement) {
      crawlDom(element.parentElement);
    }
  }
  crawlDom(event.target);
}
document.body.addEventListener('click', supportExternalLinks, false);
