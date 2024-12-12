<svelte:options accessors />

<!--immutable={true}/>-->
<script lang="ts">

  import * as aq from 'arquero';
    import { onMount } from 'svelte';


  let data;
  export function render(_data, name) {
    data = _data ?? data;
    if (!data || data.length == 0) return;
    let data_table = aq.from(data);
    document.getElementById("table").innerHTML = data_table.toHTML();
  }

</script>
<div class="table-auto">
  <div id="table"/>
</div>

