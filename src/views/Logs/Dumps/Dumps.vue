<template>
  <b-container fluid="xl">
    <page-title />
    <b-row>
      <b-col sm="6" lg="5" xl="4">
        <page-section :section-title="$t('pageDumps.initiateDump')">
          <dumps-form />
        </page-section>
      </b-col>
    </b-row>
    <b-row>
      <b-col xl="10">
        <page-section :section-title="$t('pageDumps.dumpsAvailableOnBmc')">
          <b-row class="align-items-start">
            <b-col sm="8" xl="6" class="d-sm-flex align-items-end">
              <search
                :placeholder="$t('pageDumps.table.searchDumps')"
                @change-search="onChangeSearchInput"
                @clear-search="onClearSearchInput"
              />
              <div class="ml-sm-4">
                <table-cell-count
                  :filtered-items-count="filteredRows"
                  :total-number-of-cells="allDumps.length"
                ></table-cell-count>
              </div>
            </b-col>
            <b-col sm="8" md="7" xl="6">
              <table-date-filter @change="onChangeDateTimeFilter" />
            </b-col>
          </b-row>
          <b-row>
            <b-col class="text-right">
              <table-filter
                :filters="tableFilters"
                @filter-change="onFilterChange"
              />
            </b-col>
          </b-row>
          <table-toolbar
            :selected-items-count="selectedRows.length"
            :actions="batchActions"
            @clear-selected="clearSelectedRows($refs.table)"
            @batch-action="onTableBatchAction"
          />
          <b-table
            ref="table"
            show-empty
            hover
            sort-icon-left
            no-sort-reset
            sort-desc
            selectable
            no-select-on-click
            responsive="md"
            sort-by="dateTime"
            :fields="fields"
            :items="filteredDumps"
            :empty-text="$t('global.table.emptyMessage')"
            :empty-filtered-text="$t('global.table.emptySearchMessage')"
            :filter="searchFilter"
            :busy="isBusy"
            @filtered="onFiltered"
            @row-selected="onRowSelected($event, filteredTableItems.length)"
          >
            <!-- Checkbox column -->
            <template #head(checkbox)>
              <b-form-checkbox
                v-model="tableHeaderCheckboxModel"
                :indeterminate="tableHeaderCheckboxIndeterminate"
                @change="onChangeHeaderCheckbox($refs.table)"
              >
                <span class="sr-only">{{ $t('global.table.selectAll') }}</span>
              </b-form-checkbox>
            </template>
            <template #cell(checkbox)="row">
              <b-form-checkbox
                v-model="row.rowSelected"
                @change="toggleSelectRow($refs.table, row.index)"
              >
                <span class="sr-only">{{ $t('global.table.selectItem') }}</span>
              </b-form-checkbox>
            </template>

            <!-- Date and Time column -->
            <template #cell(dateTime)="{ value }">
              <p class="mb-0">{{ $filters.formatDate(value) }}</p>
              <p class="mb-0">{{ $filters.formatTime(value) }}</p>
            </template>

            <!-- Size column -->
            <template #cell(size)="{ value }">
              {{ convertBytesToMegabytes(value) }} MB
            </template>

            <!-- Actions column -->
            <template #cell(actions)="row">
              <table-row-action
                v-for="(action, index) in row.item.actions"
                :key="index"
                :value="action.value"
                :title="action.title"
                :download-location="row.item.data"
                :export-name="exportFileName(row)"
                @click-table-action="onTableRowAction($event, row.item)"
              >
                <template #icon>
                  <icon-download v-if="action.value === 'download'" />
                  <icon-delete v-if="action.value === 'delete'" />
                </template>
              </table-row-action>
            </template>
          </b-table>
        </page-section>
      </b-col>
    </b-row>
    <!-- Table pagination -->
    <b-row>
      <b-col sm="6" xl="5">
        <b-form-group
          class="table-pagination-select"
          :label="$t('global.table.itemsPerPage')"
          label-for="pagination-items-per-page"
        >
          <b-form-select
            id="pagination-items-per-page"
            v-model="perPage"
            :options="itemsPerPageOptions"
          />
        </b-form-group>
      </b-col>
      <b-col sm="6" xl="5">
        <b-pagination
          v-model="currentPage"
          first-number
          last-number
          :per-page="perPage"
          :total-rows="getTotalRowCount()"
          aria-controls="table-dump-entries"
        />
      </b-col>
    </b-row>
  </b-container>
</template>

<script>
import IconDelete from '@carbon/icons-vue/es/trash-can/20';
import IconDownload from '@carbon/icons-vue/es/download/20';
import DumpsForm from './DumpsForm';
import PageSection from '@/components/Global/PageSection';
import PageTitle from '@/components/Global/PageTitle';
import Search from '@/components/Global/Search';
import TableCellCount from '@/components/Global/TableCellCount';
import TableDateFilter from '@/components/Global/TableDateFilter';
import TableRowAction from '@/components/Global/TableRowAction';
import TableToolbar from '@/components/Global/TableToolbar';
import BVTableSelectableMixin, {
  selectedRows,
  tableHeaderCheckboxModel,
  tableHeaderCheckboxIndeterminate,
} from '@/components/Mixins/BVTableSelectableMixin';
import BVToastMixin from '@/components/Mixins/BVToastMixin';
import BVPaginationMixin, {
  currentPage,
  perPage,
  itemsPerPageOptions,
} from '@/components/Mixins/BVPaginationMixin';
import LoadingBarMixin from '@/components/Mixins/LoadingBarMixin';
import SearchFilterMixin, {
  searchFilter,
} from '@/components/Mixins/SearchFilterMixin';
import TableFilter from '@/components/Global/TableFilter';
import TableFilterMixin from '@/components/Mixins/TableFilterMixin';
import i18n from '@/i18n';
import { useI18n } from 'vue-i18n';

export default {
  components: {
    DumpsForm,
    IconDelete,
    IconDownload,
    PageSection,
    PageTitle,
    Search,
    TableCellCount,
    TableDateFilter,
    TableRowAction,
    TableToolbar,
    TableFilter,
  },
  mixins: [
    BVTableSelectableMixin,
    BVToastMixin,
    BVPaginationMixin,
    LoadingBarMixin,
    SearchFilterMixin,
    TableFilterMixin,
  ],
  beforeRouteLeave(to, from, next) {
    // Hide loader if the user navigates to another page
    // before request is fulfilled.
    this.hideLoader();
    next();
  },
  data() {
    return {
      $t: useI18n().t,
      isBusy: true,
      fields: [
        {
          key: 'checkbox',
          sortable: false,
        },
        {
          key: 'dateTime',
          label: i18n.global.t('pageDumps.table.dateAndTime'),
          sortable: true,
        },
        {
          key: 'dumpType',
          label: i18n.global.t('pageDumps.table.dumpType'),
          sortable: true,
        },
        {
          key: 'id',
          label: i18n.global.t('pageDumps.table.id'),
          sortable: true,
        },
        {
          key: 'size',
          label: i18n.global.t('pageDumps.table.size'),
          sortable: true,
        },
        {
          key: 'actions',
          sortable: false,
          label: '',
          tdClass: 'text-right text-nowrap',
        },
      ],
      batchActions: [
        {
          value: 'delete',
          label: i18n.global.t('global.action.delete'),
        },
      ],
      tableFilters: [
        {
          key: 'dumpType',
          label: i18n.global.t('pageDumps.table.dumpType'),
          values: [
            'BMC Dump Entry',
            'Hostboot Dump Entry',
            'Resource Dump Entry',
            'System Dump Entry',
          ],
        },
      ],
      activeFilters: [],
      currentPage: currentPage,
      filterEndDate: null,
      filterStartDate: null,
      itemsPerPageOptions: itemsPerPageOptions,
      perPage: perPage,
      searchFilter,
      searchTotalFilteredRows: 0,
      selectedRows,
      tableHeaderCheckboxIndeterminate,
      tableHeaderCheckboxModel,
    };
  },
  computed: {
    filteredRows() {
      return this.searchFilter
        ? this.searchTotalFilteredRows
        : this.filteredDumps.length;
    },
    allDumps() {
      return this.$store.getters['dumps/allDumps'].map((item) => {
        return {
          ...item,
          actions: [
            {
              value: 'download',
              title: i18n.global.t('global.action.download'),
            },
            {
              value: 'delete',
              title: i18n.global.t('global.action.delete'),
            },
          ],
        };
      });
    },
    filteredDumpsByDate() {
      return this.getFilteredTableDataByDate(
        this.allDumps,
        this.filterStartDate,
        this.filterEndDate,
        'dateTime',
      );
    },
    filteredDumps() {
      return this.getFilteredTableData(
        this.filteredDumpsByDate,
        this.activeFilters,
      );
    },
  },
  created() {
    this.startLoader();
    this.$store.dispatch('dumps/getAllDumps').finally(() => {
      this.endLoader();
      this.isBusy = false;
    });
  },
  methods: {
    convertBytesToMegabytes(bytes) {
      return parseFloat((bytes / 1000000).toFixed(3));
    },
    onFilterChange({ activeFilters }) {
      this.activeFilters = activeFilters;
    },
    onFiltered(filteredItems) {
      this.searchTotalFilteredRows = filteredItems.length;
    },
    onChangeDateTimeFilter({ fromDate, toDate }) {
      this.filterStartDate = fromDate;
      this.filterEndDate = toDate;
    },
    onTableRowAction(action, dump) {
      if (action === 'delete') {
        this.$bvModal
          .msgBoxConfirm(
            i18n.global.t('pageDumps.modal.deleteDumpConfirmation'),
            {
              title: i18n.global.t('pageDumps.modal.deleteDump'),
              okTitle: i18n.global.t('pageDumps.modal.deleteDump'),
              cancelTitle: i18n.global.t('global.action.cancel'),
              autoFocusButton: 'ok',
            },
          )
          .then((deleteConfrimed) => {
            if (deleteConfrimed) {
              this.$store
                .dispatch('dumps/deleteDumps', [dump])
                .then((messages) => {
                  messages.forEach(({ type, message }) => {
                    if (type === 'success') {
                      this.successToast(message);
                    } else if (type === 'error') {
                      this.errorToast(message);
                    }
                  });
                });
            }
          });
      }
    },
    onTableBatchAction(action) {
      if (action === 'delete') {
        this.$bvModal
          .msgBoxConfirm(
            i18n.global.t(
              'pageDumps.modal.deleteDumpConfirmation',
              this.selectedRows.length,
            ),
            {
              title: i18n.global.t(
                'pageDumps.modal.deleteDump',
                this.selectedRows.length,
              ),
              okTitle: i18n.global.t(
                'pageDumps.modal.deleteDump',
                this.selectedRows.length,
              ),
              cancelTitle: i18n.global.t('global.action.cancel'),
              autoFocusButton: 'ok',
            },
          )
          .then((deleteConfrimed) => {
            if (deleteConfrimed) {
              if (this.selectedRows.length === this.dumps.length) {
                this.$store
                  .dispatch('dumps/deleteAllDumps')
                  .then((success) => this.successToast(success))
                  .catch(({ message }) => this.errorToast(message));
              } else {
                this.$store
                  .dispatch('dumps/deleteDumps', this.selectedRows)
                  .then((messages) => {
                    messages.forEach(({ type, message }) => {
                      if (type === 'success') {
                        this.successToast(message);
                      } else if (type === 'error') {
                        this.errorToast(message);
                      }
                    });
                  });
              }
            }
          });
      }
    },
    exportFileName(row) {
      let filename = row.item.dumpType + '_' + row.item.id + '.tar.xz';
      filename = filename.replace(RegExp(' ', 'g'), '_');
      return filename;
    },
  },
};
</script>
