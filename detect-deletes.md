# detect deletions in servicenow

Subscribe the rollback information from ServiceNow and close the records. (DELETE)
Table: sys_rollback_sequence
Query: operation=delete^target_class_nameSTARTSWITHincident (table name must be dynamic or remove to get all deletes)
Data in this table remains for 7 days, make sure the refresh interval is higher
Once the table is refreshed, close all records in all subscribed tables

Subscribe the archive log from ServiceNow and close the records (ARCHIVED)
Table: sys_archive_log
Query: from_table=incident (table name must be dynamic or remove to get all deletes)
I did not find any retention information about the data, but I'd make the interval the same as above
Once the table is refreshed, mark all records in all subscribed tables as archived.
