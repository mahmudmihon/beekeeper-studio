<template>
  <div class="join-query-builder">
    <div class="fixed">
      <!-- Header with title and execute button -->
      <div class="join-builder-header">
        <h3 class="join-title">Join Query Builder</h3>
        <button 
          class="btn btn-primary execute-btn"
          @click="executeJoinQuery"
          :disabled="!canExecuteQuery"
        >
          <i class="material-icons">play_arrow</i>
          Execute
        </button>
      </div>
    </div>

    <div class="list-body">
      <!-- Join Operations List -->
      <div class="join-operations">
        <div 
          v-for="(join, index) in joins" 
          :key="index"
          class="join-operation"
        >
          <div class="join-header">
            <h4>{{ index === 0 ? 'Base Join' : `Join ${index + 1}` }}</h4>
            <button 
              v-if="index > 0"
              class="btn btn-sm btn-danger remove-join-btn"
              @click="removeJoin(index)"
              title="Remove this join"
            >
              <i class="material-icons">close</i>
            </button>
          </div>

          <!-- Join Type Selection -->
          <div class="form-group">
            <label>Join Type:</label>
            <select 
              v-model="join.type" 
              class="form-control"
              @change="validateJoin(index)"
            >
              <option value="">Select Join Type</option>
              <option value="INNER">INNER JOIN</option>
              <option value="LEFT">LEFT JOIN</option>
              <option value="RIGHT">RIGHT JOIN</option>
              <option value="FULL">FULL OUTER JOIN</option>
            </select>
          </div>

          <!-- First Table Selection -->
          <div class="form-group">
            <label>{{ index === 0 ? 'First Table:' : 'Join To Table:' }}</label>
            <select 
              v-model="join.firstTable" 
              class="form-control"
              @change="onFirstTableChange(index)"
            >
              <option value="">Select Table</option>
              <option 
                v-for="table in availableTablesForJoin(index)"
                :key="table.key"
                :value="table.key"
              >
                {{ table.display }}
              </option>
            </select>
          </div>

          <!-- First Table Field Selection -->
          <div class="form-group">
            <label>Field from {{ getTableDisplayName(join.firstTable) || 'First Table' }}:</label>
            <select 
              v-model="join.firstField" 
              class="form-control"
              :disabled="!join.firstTable"
              @change="validateJoin(index)"
            >
              <option value="">Select Field</option>
              <option 
                v-for="field in getTableFields(join.firstTable)"
                :key="field.columnName"
                :value="field.columnName"
              >
                {{ field.columnName }} ({{ field.dataType }})
              </option>
            </select>
          </div>

          <!-- Second Table Selection -->
          <div class="form-group">
            <label>{{ index === 0 ? 'Second Table:' : 'With Table:' }}</label>
            <select 
              v-model="join.secondTable" 
              class="form-control"
              @change="onSecondTableChange(index)"
            >
              <option value="">Select Table</option>
              <option 
                v-for="table in availableTablesForJoin(index)"
                :key="table.key"
                :value="table.key"
              >
                {{ table.display }}
              </option>
            </select>
          </div>

          <!-- Second Table Field Selection -->
          <div class="form-group">
            <label>Field from {{ getTableDisplayName(join.secondTable) || 'Second Table' }}:</label>
            <select 
              v-model="join.secondField" 
              class="form-control"
              :disabled="!join.secondTable"
              @change="validateJoin(index)"
            >
              <option value="">Select Field</option>
              <option 
                v-for="field in getTableFields(join.secondTable)"
                :key="field.columnName"
                :value="field.columnName"
              >
                {{ field.columnName }} ({{ field.dataType }})
              </option>
            </select>
          </div>

          <!-- Join validation message -->
          <div v-if="join.validationMessage" class="validation-message error">
            {{ join.validationMessage }}
          </div>
        </div>
      </div>

      <!-- Add Join Button -->
      <div class="add-join-section">
        <button 
          class="btn btn-secondary add-join-btn"
          @click="addJoin"
          :disabled="!canAddJoin"
        >
          <i class="material-icons">add</i>
          Add Another Join
        </button>
      </div>


    </div>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import rawLog from '@bksLogger'
import { AppEvent } from '@/common/AppEvent'

const log = rawLog.scope('join-query-builder')

export default {
  name: 'JoinQueryBuilder',
  data() {
    return {
      // Array of join operations
      joins: [
        {
          type: '',
          firstTable: '',
          firstField: '',
          secondTable: '',
          secondField: '',
          validationMessage: ''
        }
      ],
      // Cache for table columns
      tableColumnsCache: {}
    }
  },
  computed: {
    ...mapState(['tables', 'database', 'connection']),
    ...mapGetters(['schemaTables']),
    
    // Check if we can execute the query (at least one valid join)
    canExecuteQuery() {
      return this.joins.length > 0 && this.joins.some(join => this.isJoinValid(join))
    },
    
    // Check if we can add another join (previous joins must be valid)
    canAddJoin() {
      return this.joins.every(join => this.isJoinValid(join))
    },
    
    // Generate SQL query from current joins
    generatedSQL() {
      if (!this.canExecuteQuery) return ''
      
      try {
        return this.generateJoinSQL()
      } catch (error) {
        log.error('Error generating SQL:', error)
        return ''
      }
    }
  },
  watch: {
    // Watch for database changes to refresh table data
    database() {
      this.resetBuilder()
    },
    
    // Watch tables to clear cache when they change
    tables() {
      this.tableColumnsCache = {}
    },
    
    // Clear cache when tables are updated (columns loaded)
    schemaTables: {
      handler() {
        this.tableColumnsCache = {}
      },
      deep: true
    }
  },
  methods: {
    /**
     * Get available tables for join operations
     * For the first join, show all tables
     * For subsequent joins, show all tables plus the virtual "joined" table
     */
    availableTablesForJoin(joinIndex) {
      const tables = []
      
      // System schemas to filter out
      const systemSchemas = ['information_schema', 'pg_catalog', 'sys', 'performance_schema', 'mysql']
      
      // Add all real tables from all schemas, excluding system schemas
      this.schemaTables.forEach(schemaGroup => {
        // Skip system schemas
        if (schemaGroup.schema && systemSchemas.includes(schemaGroup.schema.toLowerCase())) {
          return
        }
        
        schemaGroup.tables.forEach(table => {
          const key = schemaGroup.skipSchemaDisplay ? table.name : `${table.schema}.${table.name}`
          tables.push({
            key: key,
            display: schemaGroup.skipSchemaDisplay ? table.name : `${table.schema}.${table.name}`,
            table: table,
            isVirtual: false
          })
        })
      })
      
      // For joins after the first one, add the virtual joined table option
      if (joinIndex > 0) {
        tables.unshift({
          key: '__joined_table__',
          display: 'Previous Join Result',
          table: null,
          isVirtual: true
        })
      }
      
      return tables.sort((a, b) => a.display.localeCompare(b.display))
    },
    
    /**
     * Get display name for a table key
     */
    getTableDisplayName(tableKey) {
      if (!tableKey) return ''
      if (tableKey === '__joined_table__') return 'Previous Join Result'
      return tableKey
    },
    
    /**
     * Get fields/columns for a specific table
     */
    getTableFields(tableKey) {
      if (!tableKey) return []
      
      // Handle virtual joined table
      if (tableKey === '__joined_table__') {
        return this.getJoinedTableFields()
      }
      
      // Check cache first
      if (this.tableColumnsCache[tableKey]) {
        return this.tableColumnsCache[tableKey]
      }
      
      // Find the actual table object
      let targetTable = null
      const systemSchemas = ['information_schema', 'pg_catalog', 'sys', 'performance_schema', 'mysql']
      
      this.schemaTables.forEach(schemaGroup => {
        // Skip system schemas
        if (schemaGroup.schema && systemSchemas.includes(schemaGroup.schema.toLowerCase())) {
          return
        }
        
        schemaGroup.tables.forEach(table => {
          const key = schemaGroup.skipSchemaDisplay ? table.name : `${table.schema}.${table.name}`
          if (key === tableKey) {
            targetTable = table
          }
        })
      })
      
      if (!targetTable) return []
      
      // If columns are not loaded, trigger loading
      if (!targetTable.columns || targetTable.columns.length === 0) {
        this.$store.dispatch('updateTableColumns', targetTable)
        return [] // Return empty array while loading
      }
      
      // Cache and return the columns
      const columns = targetTable.columns || []
      this.tableColumnsCache[tableKey] = columns
      return columns
    },
    
    /**
     * Get fields from the virtual joined table (previous join results)
     */
    getJoinedTableFields() {
      const fields = []
      
      // Collect fields from all previous valid joins
      for (let i = 0; i < this.joins.length; i++) {
        const join = this.joins[i]
        if (!this.isJoinValid(join)) continue
        
        // Add fields from first table
        if (join.firstTable !== '__joined_table__') {
          const firstTableFields = this.getTableFields(join.firstTable)
          const firstTableName = this.extractTableName(join.firstTable)
          firstTableFields.forEach(field => {
            fields.push({
              columnName: `${firstTableName}.${field.columnName}`,
              dataType: field.dataType
            })
          })
        }
        
        // Add fields from second table
        if (join.secondTable !== '__joined_table__') {
          const secondTableFields = this.getTableFields(join.secondTable)
          const secondTableName = this.extractTableName(join.secondTable)
          secondTableFields.forEach(field => {
            fields.push({
              columnName: `${secondTableName}.${field.columnName}`,
              dataType: field.dataType
            })
          })
        }
      }
      
      // Remove duplicates
      const uniqueFields = []
      const seen = new Set()
      fields.forEach(field => {
        if (!seen.has(field.columnName)) {
          seen.add(field.columnName)
          uniqueFields.push(field)
        }
      })
      
      return uniqueFields
    },
    
    /**
     * Extract table name from table key (remove schema if present)
     */
    extractTableName(tableKey) {
      if (tableKey === '__joined_table__') return 'joined'
      const parts = tableKey.split('.')
      return parts[parts.length - 1]
    },
    
    /**
     * Quote table name for SQL (handles schema.table format)
     */
    quoteTableName(tableKey) {
      if (!tableKey || tableKey === '__joined_table__') return tableKey
      
      // If it contains a dot, quote both schema and table parts
      if (tableKey.includes('.')) {
        const parts = tableKey.split('.')
        return parts.map(part => `"${part}"`).join('.')
      }
      
      // Single table name, just quote it
      return `"${tableKey}"`
    },
    
    /**
     * Handle first table selection change
     */
    onFirstTableChange(index) {
      const join = this.joins[index]
      join.firstField = '' // Reset field selection
      this.validateJoin(index)
    },
    
    /**
     * Handle second table selection change
     */
    onSecondTableChange(index) {
      const join = this.joins[index]
      join.secondField = '' // Reset field selection
      this.validateJoin(index)
    },
    
    /**
     * Validate a specific join operation
     */
    validateJoin(index) {
      const join = this.joins[index]
      join.validationMessage = ''
      
      if (!join.type) {
        join.validationMessage = 'Please select a join type'
        return false
      }
      
      if (!join.firstTable) {
        join.validationMessage = 'Please select the first table'
        return false
      }
      
      if (!join.firstField) {
        join.validationMessage = 'Please select a field from the first table'
        return false
      }
      
      if (!join.secondTable) {
        join.validationMessage = 'Please select the second table'
        return false
      }
      
      if (!join.secondField) {
        join.validationMessage = 'Please select a field from the second table'
        return false
      }
      
      if (join.firstTable === join.secondTable) {
        join.validationMessage = 'Cannot join a table with itself'
        return false
      }
      
      return true
    },
    
    /**
     * Check if a join is valid
     */
    isJoinValid(join) {
      return join.type && join.firstTable && join.firstField && 
             join.secondTable && join.secondField && 
             join.firstTable !== join.secondTable
    },
    
    /**
     * Add a new join operation
     */
    addJoin() {
      if (!this.canAddJoin) return
      
      this.joins.push({
        type: '',
        firstTable: '',
        firstField: '',
        secondTable: '',
        secondField: '',
        validationMessage: ''
      })
    },
    
    /**
     * Remove a join operation
     */
    removeJoin(index) {
      if (index === 0) return // Cannot remove the first join
      this.joins.splice(index, 1)
    },
    
    /**
     * Generate SQL query from current joins
     */
    generateJoinSQL() {
      if (!this.canExecuteQuery) return ''
      
      const validJoins = this.joins.filter(join => this.isJoinValid(join))
      if (validJoins.length === 0) return ''
      
      let sql = ''
      let fromClause = ''
      const joinClauses = []
      
      // Process first join
      const firstJoin = validJoins[0]
      const firstTableName = this.extractTableName(firstJoin.firstTable)
      const secondTableName = this.extractTableName(firstJoin.secondTable)
      
      // Build SELECT clause with prefixed column names
      const selectColumns = []
      
      // Add columns from first table
      const firstTableFields = this.getTableFields(firstJoin.firstTable)
      firstTableFields.forEach(field => {
        selectColumns.push(`"${firstTableName}"."${field.columnName}" AS "${firstTableName}_${field.columnName}"`)
      })
      
      // Add columns from second table
      const secondTableFields = this.getTableFields(firstJoin.secondTable)
      secondTableFields.forEach(field => {
        selectColumns.push(`"${secondTableName}"."${field.columnName}" AS "${secondTableName}_${field.columnName}"`)
      })
      
      // FROM clause - properly quote schema.table format and alias
      const quotedFirstTable = this.quoteTableName(firstJoin.firstTable)
      fromClause = `FROM ${quotedFirstTable} AS "${firstTableName}"`
      
      // First JOIN clause - properly quote schema.table format and alias
      const quotedSecondTable = this.quoteTableName(firstJoin.secondTable)
      joinClauses.push(
        `${firstJoin.type} JOIN ${quotedSecondTable} AS "${secondTableName}" ` +
        `ON "${firstTableName}"."${firstJoin.firstField}" = "${secondTableName}"."${firstJoin.secondField}"`
      )
      
      // Process additional joins
      for (let i = 1; i < validJoins.length; i++) {
        const join = validJoins[i]
        const joinTableName = this.extractTableName(join.secondTable)
        
        // Add columns from the new table being joined
        if (join.secondTable !== '__joined_table__') {
          const joinTableFields = this.getTableFields(join.secondTable)
          joinTableFields.forEach(field => {
            selectColumns.push(`"${joinTableName}"."${field.columnName}" AS "${joinTableName}_${field.columnName}"`)
          })
        }
        
        // Add JOIN clause
        let onClause = ''
        if (join.firstTable === '__joined_table__') {
          // Joining with previous result - the field name already includes table prefix
          // e.g., join.firstField might be "Tenants.TimeZoneId"
          if (join.firstField.includes('.')) {
            // Field already has table prefix, use it directly with quotes
            const [tablePrefix, fieldName] = join.firstField.split('.')
            onClause = `"${tablePrefix}"."${fieldName}" = "${joinTableName}"."${join.secondField}"`
          } else {
            // Fallback: field without prefix (shouldn't happen but handle gracefully)
            onClause = `"${join.firstField}" = "${joinTableName}"."${join.secondField}"`
          }
        } else {
          const joinFirstTableName = this.extractTableName(join.firstTable)
          onClause = `"${joinFirstTableName}"."${join.firstField}" = "${joinTableName}"."${join.secondField}"`
        }
        
        const quotedJoinTable = this.quoteTableName(join.secondTable)
        joinClauses.push(
          `${join.type} JOIN ${quotedJoinTable} AS "${joinTableName}" ON ${onClause}`
        )
      }
      
      // Combine all parts
      sql = `SELECT\n  ${selectColumns.join(',\n  ')}\n${fromClause}\n${joinClauses.join('\n')}`
      
      return sql
    },
    
    /**
     * Execute the join query
     */
    async executeJoinQuery() {
      if (!this.canExecuteQuery) {
        this.$noty.error('Please complete at least one valid join operation')
        return
      }
      
      const sql = this.generatedSQL
      if (!sql) {
        this.$noty.error('Unable to generate SQL query')
        return
      }
      
      try {
        log.info('Executing join query:', sql)
        
        // Create a new query tab with the generated SQL using the AppEvent system
        this.$root.$emit(AppEvent.newTab, sql, 'Join Query')
        
        // Show success message
        this.$noty.success('Join query created in new tab')
        
      } catch (error) {
        log.error('Error executing join query:', error)
        this.$noty.error(`Error executing join query: ${error.message}`)
      }
    },
    
    /**
     * Reset the builder to initial state
     */
    resetBuilder() {
      this.joins = [
        {
          type: '',
          firstTable: '',
          firstField: '',
          secondTable: '',
          secondField: '',
          validationMessage: ''
        }
      ]
      this.tableColumnsCache = {}
    }
  },
  
  mounted() {
    log.info('Join Query Builder mounted')
  }
}
</script>

<style scoped>
.join-query-builder {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.join-builder-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--bks-border-color, #e0e0e0);
}

.join-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 600;
  color: var(--bks-text-dark, #333);
}

.execute-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  font-size: 0.9rem;
}

.execute-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.join-operations {
  margin-bottom: 1.5rem;
}

.join-operation {
  background: var(--bks-sidebar-bg, #f8f9fa);
  border: 1px solid var(--bks-border-color, #e0e0e0);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}

.join-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.join-header h4 {
  margin: 0;
  font-size: 1rem;
  font-weight: 500;
  color: var(--bks-text-dark, #333);
}

.remove-join-btn {
  padding: 0.25rem 0.5rem;
  font-size: 0.8rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.5rem;
  font-weight: 500;
  color: var(--bks-text-dark, #333);
  font-size: 0.9rem;
}

.form-control {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid var(--bks-border-color, #ccc);
  border-radius: 4px;
  font-size: 0.9rem;
  background: var(--bks-theme-bg, white);
  color: var(--bks-text-dark, #333);
}

.form-control:focus {
  outline: none;
  border-color: var(--bks-theme-primary, #007bff);
  box-shadow: 0 0 0 2px rgba(0, 123, 255, 0.25);
}

.form-control:disabled {
  background-color: var(--bks-theme-bg-light, #f8f9fa);
  opacity: 0.6;
  cursor: not-allowed;
}

.validation-message {
  margin-top: 0.5rem;
  padding: 0.5rem;
  border-radius: 4px;
  font-size: 0.85rem;
}

.validation-message.error {
  background-color: rgba(220, 53, 69, 0.1);
  color: #dc3545;
  border: 1px solid rgba(220, 53, 69, 0.3);
}

.add-join-section {
  text-align: center;
  margin-bottom: 1.5rem;
}

.add-join-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  font-size: 0.9rem;
}

.add-join-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}


</style>