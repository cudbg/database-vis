<svelte:options accessors />

<!--immutable={true}/>-->
<script lang="ts">

  export let conn = null;
  export let tableName = '';
  export let query = '';
  function onSubmit() {
    if (conn && tableName.trim() != '')
      conn.exec(`SELECT * FROM ${tableName}`)
  }

  function onQuery() {
    if (conn && query.trim() != '')
      conn.exec(query)
  }


</script>
<form on:submit|preventDefault={onSubmit}>
  <input style="width: 90%" placeholder="table name" bind:value={tableName}/>
</form>

<form on:submit|preventDefault={onQuery}>
  <div><textarea placeholder="query" style="width: 90%; border: 1px solid black;" bind:value={query} rows="4" /></div>
  <div><button style="border: 1px solid black;" type="submit">Query</button></div>
</form>
