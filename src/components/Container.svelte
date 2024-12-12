<script lang="ts">

</script>


<div class="px-5 py-2 bg-white border-solid border-2 border-black">
  
  <div class="mx-auto">
    <slot name="header"/>
  </div>
  <div class="">
    <slot name="alert" />
  </div>
  <div class="mx-auto">
    <slot  name="dropdown1" />
    <slot  name="dropdown2" />
  </div>

  <div class="">
    <slot name="chart1" />
  </div>

  <div class="">
    <slot  name="chart2" />
  </div>

  <div class="">
    <slot name="chart3" />
  </div>
  <div class="">
    <slot  name="chart4" />
  </div>

  <div class="">
    <slot  name="obplot" />
  </div>

  <div class="">
    <slot name="slider1"/>
  </div>

  <div class="">
    <slot name="slider2"/>
  </div>

  <div class="">
    <slot name="slider3"/>
  </div>

  <div class="">
    <slot name="slider4"/>
  </div>

</div>

<style>

</style>
