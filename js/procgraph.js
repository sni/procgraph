var sys  = require('sys')
var exec = require('child_process').exec;

function parse_top_output(error, stdout, stderr) {
  var lines = stdout.split(/\n/);
  var proc_started = false;

  // empty table first
  $("#proctable td").parent().remove();

  var filter = $('#proctablefilter').val();

  for(var i=0, len=lines.length; i<len; i++) {
    var line = lines[i];
    if(proc_started && !line.match(/^\s*$/) && (!filter || line.match(filter))) {
      line = line.replace(/^\s+/g, '');
      var data = line.split(/\s+/g);
      $('#proctable tbody').append('<tr class="clickable" onclick="startGraphing('+data[0]+')">'
                                    +'<td class="pid">'+data.shift()+'</td>'
                                    +'<td class="user">'+data.shift()+'</td>'
                                    +'<td class="pr">'+data.shift()+'</td>'
                                    +'<td class="ni">'+data.shift()+'</td>'
                                    +'<td class="virt">'+data.shift()+'</td>'
                                    +'<td class="res">'+data.shift()+'</td>'
                                    +'<td class="shr">'+data.shift()+'</td>'
                                    +'<td class="s">'+data.shift()+'</td>'
                                    +'<td class="cpu">'+data.shift()+'</td>'
                                    +'<td class="mem">'+data.shift()+'</td>'
                                    +'<td class="time">'+data.shift()+'</td>'
                                    +'<td class="command">'+data.join(' ')+'</td>'
                                    +'</tr>');
    }
    if(line.match(/^\s*PID\s+USER/)) {
      proc_started = true;
    }
  }
  $.bootstrapSortable(true);
}

function update_proctable() {
// TODO: start once without -n1 and add -d 1, then update constantly
  exec("top -b -n 1 -w 1000 -c", parse_top_output);
}

var plot, series, graph_interval, lastPid;
var d1 = [], d2 = [], d3 = [], d4 = [];
function startGraphing(pid) {
  clearInterval(procUpdateInterval);
  $('#procpanel').hide();
  $('#graphtable').show();
  $('#backimg').show();

  if(lastPid != undefined && lastPid != pid) {
    // reset series
    d1 = [];
    d2 = [];
    d3 = [];
    d4 = [];
  }
  lastPid = pid;

  var s1 = {
    label: "virt",
    data: d1
  };
  var s2 = {
    label: "res",
    data: d2
  };
  var s3 = {
    label: "shr",
    data: d3
  };
  var s4 = {
    label: "cpu",
    data: d4,
    yaxis: 2
  };
  var options = {
    xaxis: { mode: "time" },
    yaxes: [ { // left size axis
               tickFormatter: function(val, axis) {
                val = val * 1024;
                // value is in KiB initially
                if(val > 1073741824)
                  return (val / 1073741824).toFixed(1) + " GB";
                else if (val > 1048576)
                  return (val / 1048576).toFixed(axis.tickDecimals) + " MB";
                else if (val > 1024)
                  return (val / 1024).toFixed(axis.tickDecimals) + " KB";
                else
                  return val.toFixed(axis.tickDecimals) + " B";

               }
             },
             { // right cpu axis
               position: "right",
               min: 0,
               max: 100,
               tickFormatter: function(val, axis) { return(val+"%"); }
              }
          ],
    grid: {
      hoverable: true,
    }
  };
  series = [s1, s2, s3, s4];
  plot = $.plot('#procgraph', series, options);
  graph_interval = setInterval(updateGraph, 40, [pid]);

  /* graph hover */
  $("#procgraph").bind("plothover", function (event, pos, item) {
    if (item) {
// TODO: format timestamp
      var x = item.datapoint[0].toFixed(2),
          y = item.datapoint[1].toFixed(2);

      $("#tooltip").html(x + ": " + item.series.label + " = " + y)
                   .css({top: item.pageY+5, left: item.pageX+5})
                   .fadeIn(200);
    } else {
      $("#tooltip").hide();
    }
  });
}

function updateGraph(pid) {
// TODO: start once without -n1 and add -d 1, then update constantly
  exec("top -b -n 1 -w 1000 -c -p "+pid, graph_top_output);
}

function graph_top_output(error, stdout, stderr) {
  var proc_started = false;
  var lines     = stdout.split(/\n/);
  var date      = new Date();
  var timestamp = date.getTime();
  for(var i=0, len=lines.length; i<len; i++) {
    var line = lines[i];
    if(proc_started && !line.match(/^\s*$/)) {
      line = line.replace(/^\s+/g, '');
      var data = line.split(/\s+/g);
      series[0].data.push([timestamp, Number(data[4])]); // virt
      series[1].data.push([timestamp, Number(data[5])]); // res
      series[2].data.push([timestamp, Number(data[6])]); // shr
      series[3].data.push([timestamp, Number(data[8])]); // cpu
      i=len+1; // exit loop
      $('#pid').html(data[0]);
      $('#user').html(data[1]);
      $('#prio').html(data[2]);
      $('#nice').html(data[3]);
      $('#virt').html(data[4]);
      $('#res').html(data[5]);
      $('#shr').html(data[6]);
      $('#s').html(data[7]);
      $('#cpu').html(data[8]+" %");
      $('#mem').html(data[9]+" %");
      $('#time').html(data[10]);
      $('#command').html(data[11]);
    }
    if(line.match(/^\s*PID\s+USER/)) {
      proc_started = true;
    }
  }
  plot.setData(series);
  plot.setupGrid();
  plot.draw();
}

update_proctable();
var procUpdateInterval = setInterval(update_proctable, 5000);

/* add eventhandler for clear button */
$("#proctablefilterclear").click(function() {
  $("#proctablefilter").val('');
});

/* add eventhandler for input field */
$("#proctablefilter").keyup(function() {
  update_proctable();
});

$("#backimg").click(function() {
  $('#procpanel').show();
  $('#graphtable').hide();
  $('#backimg').hide();
  clearInterval(graph_interval);
  update_proctable();
  procUpdateInterval = setInterval(update_proctable, 5000);
});

/* support opening external urls in default browser */
var gui = require('nw.gui');
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