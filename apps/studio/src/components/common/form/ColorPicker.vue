<template>
  <div class="color-picker-container">
    <span>Label Color</span>
    <label class="color-picker-label">
      <input
        type="color"
        :value="value || '#FFFFFF'"
        @input="$emit('input', $event.target.value)"
        class="color-picker-input"
      >
      <div class="color-picker-preview" :style="{ backgroundColor: value || '#FFFFFF' }"></div>
    </label>
  </div>
</template>

<script>
  export default {
    props: ['value'],
  }
</script>

<style scoped>
  .color-picker-container {
    display: flex;
    align-items: center;
    gap: 10px;
    font-family: var(--font-family-base);
    font-size: var(--font-size-base);
  }

  .color-picker-label {
    position: relative;
    display: inline-block;
    width: 32px;
    height: 32px;
    cursor: pointer;
  }

  .color-picker-input {
    width: 32px;
    height: 32px;
    opacity: 0;
    cursor: pointer;
  }

  .color-picker-preview {
    position: absolute;
    top: 0;
    left: 0;
    width: 32px;
    height: 20px;
    margin-top: 5px;
    border-radius: 4px;
    border: 1px solid var(--border-color);
    pointer-events: none;
  }
</style>
