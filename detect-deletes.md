# Detect Deleted and Archived Records in ServiceNow

## Delete

Subscribe the rollback information from ServiceNow and close the records. (DELETE)
Table: sys_rollback_sequence
Fields: target_class_name, document_id
Query: operation=delete^target_class_nameINu_rest_api_acl_test,next_table^context.sys_created_on>LAST_RUN (table name must be dynamic or remove to get all deletes)
Data in this table remains for 7 days, make sure the refresh interval is higher
Once the table is refreshed, close all records in all subscribed tables

## Archive

Subscribe the archive log from ServiceNow and close the records (ARCHIVED)
Table: sys_archive_log
Query: restored=NULL^from_table=incident^sys_created_on>LAST_RUN (table name must be dynamic or remove to get all archived records)
I did not find any retention information about the data, but I'd make the interval the same as above
Once the table is refreshed, mark all records in all subscribed tables as archived.
