<svelte:options accessors />


<script>
  import * as R from "ramda";
  import * as Plot from "@observablehq/plot";
  import { writable } from "svelte/store";
  import { plotRender } from "../viz/util";


  export let id,
    name,
    magic,
    description,
    options = {};       // default plot options

  let datasets = {}
  let me = null;

  // all datasets from backends will be routed here (see Backend.registerView for logic)
  // opts.target tells us the variable name to assign to the dataset
  export function render(data, opts) {
    datasets[opts.target] = data;
    update()
  }



  // how to access all props in svelte:
  // $$props;

  
  // process mark options
  if (R.is(Array, options.marks)) {
    options.marks = options.marks.map((mark) => {
      if (R.is(String, mark)) 
        mark = { type: mark }
      if (mark.type) 
        return Plot[mark.type](R.omit(['type'], mark))
      return mark;
    })
  }



  let plotcontainer = null;


  let layers = [] 
  export let addLayer = (funcOrPlotOptions) => {
    if (R.is(Function, funcOrPlotOptions))
      layers.push(funcOrPlotOptions)
    else if (R.is(Object, funcOrPlotOptions)) 
      layers.push((_, options) => R.mergeRight(options, funcOrPlotOptions))
  }

  function plot() {
    let _options = R.clone(options);
    _options.marks = _options.marks ?? []
    layers.forEach((f) => {
      if (!_options) return;
      _options = f(datasets, _options)
    })
    return _options;
  }

  function update() {
    const options = plot()
    if (!options) return
    let theplot = plotRender(options, plotcontainer)

    for (const [name, iact] of Object.entries(interactions)) {
      if (iact && iact.isActive) {
      }
    }
  }

</script>

<div id={name}>
  {#if !R.isNil(description)}<div>{description}</div>{/if}
  <div bind:this={plotcontainer} />
  <svg class="" viewBox="0 0 800 0" width="100%" height=0 />
</div>

