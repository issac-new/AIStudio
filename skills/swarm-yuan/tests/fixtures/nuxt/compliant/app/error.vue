<script setup lang="ts">
defineProps<{ error: { statusCode: number; message: string } }>();
</script>

<template>
  <div>
    <h1>Error {{ error.statusCode }}</h1>
    <p>{{ error.message }}</p>
  </div>
</template>
