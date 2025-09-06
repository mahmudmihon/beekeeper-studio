<template>
  <div class="filter-container">
    <div class="select-wrap">
      <select
        name="Filter Field"
        class="form-control"
        v-model="filter.field"
      >
        <option
          v-for="column in columns"
          :key="column.columnName"
          :value="column.columnName"
        >
          {{ column.columnName }}
        </option>
      </select>
    </div>
    <div class="select-wrap">
      <select
        name="Filter Type"
        class="form-control"
        v-model="filter.type"
        @change="maybeClearValue()"
      >
        <option
          v-for="{ value, label } in filterTypes"
          :key="value"
          :value="value"
        >
          {{ label }}
        </option>
      </select>
    </div>
    <div class="expand filter">
      <div class="filter-wrap" v-if="!isBetweenFilter">
        <input
          class="form-control filter-value"
          :class="{ 'disabled-input': isNullFilter }"
          type="text"
          ref="filterInputs"
          v-model="filter.value"
          @blur="$emit('blur')"
          :disabled="isNullFilter"
          :title="isNullFilter ?
            'You cannot provide a comparison value when checking for NULL or NOT NULL' :
            ''"
          :placeholder="getPlaceholderText()"
        >
        <button
          v-if="!isNullFilter"
          type="button"
          class="clear btn-link"
          @click.prevent="$set(filter, 'value', '')"
        >
          <i class="material-icons">cancel</i>
        </button>
      </div>
      <!-- BETWEEN operator dual input -->
      <div class="filter-wrap between-inputs" v-else>
        <input
          class="form-control filter-value between-input"
          type="text"
          ref="filterInputs"
          v-model="betweenValues.start"
          @blur="$emit('blur')"
          @input="updateBetweenValue"
          placeholder="Start value"
        >
        <span class="between-separator">AND</span>
        <input
          class="form-control filter-value between-input"
          type="text"
          v-model="betweenValues.end"
          @blur="$emit('blur')"
          @input="updateBetweenValue"
          placeholder="End value"
        >
        <button
          type="button"
          class="clear btn-link"
          @click.prevent="clearBetweenValues()"
        >
          <i class="material-icons">cancel</i>
        </button>
      </div>
    </div>
  </div>

</template>
<script lang="js">
import { TableFilterSymbols } from '@/lib/db/types';

export default {
  props: ['filter', 'columns', 'index'],
  data() {
    return {
      filterTypes: TableFilterSymbols,
      betweenValues: {
        start: '',
        end: ''
      }
    }
  },
  watch: {
    filter: {
      deep: true,
      handler() {
        this.$emit('changed', this.index, this.filter)
      }
    },
    'filter.type'() {
      // Initialize BETWEEN values when switching to BETWEEN operator
      if (this.isBetweenFilter) {
        this.initializeBetweenValues()
      }
    }
  },
  computed: {
    isNullFilter() {
      const typeOptions = this.filterTypes.find((f) => f.value === this.filter.type)
      return !!typeOptions?.nullOnly
    },
    isBetweenFilter() {
      const typeOptions = this.filterTypes.find((f) => f.value === this.filter.type)
      return !!typeOptions?.rangeInput
    }
  },
  methods: {
    maybeClearValue() {
      if (this.isNullFilter) {
        this.$set(this.filter, 'value', null)
      } else if (this.isBetweenFilter) {
        this.clearBetweenValues()
      }
    },
    getPlaceholderText() {
      if (this.filter.type === 'in' || this.filter.type === 'not in') {
        return 'Enter values separated by comma, eg: foo,bar'
      }
      return 'Enter Value'
    },
    initializeBetweenValues() {
      if (this.filter.value && Array.isArray(this.filter.value) && this.filter.value.length === 2) {
        this.betweenValues.start = this.filter.value[0]
        this.betweenValues.end = this.filter.value[1]
      } else {
        this.betweenValues.start = ''
        this.betweenValues.end = ''
      }
    },
    updateBetweenValue() {
      const values = [this.betweenValues.start, this.betweenValues.end]
      this.$set(this.filter, 'value', values.join(' AND '))
    },
    clearBetweenValues() {
      this.betweenValues.start = ''
      this.betweenValues.end = ''
      this.$set(this.filter, 'value', '')
    }
  },
  mounted() {
    if (this.isBetweenFilter) {
      this.initializeBetweenValues()
    }
  }
}
</script>

<style scoped>
  .between-inputs {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .between-input {
    flex: 1;
    min-width: 0;
  }

  .between-separator {
    font-weight: bold;
    color: #666;
    white-space: nowrap;
    padding: 0 4px;
  }

  .filter-wrap {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .clear {
    flex-shrink: 0;
  }
</style>
