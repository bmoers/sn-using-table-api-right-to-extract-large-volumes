# ServiceNow Data Replication done right

## Problem description

Loading data correctly from ServiceNow can be a challenge as records can be created, updated or deleted during the process.

Key topics:

- The data must be sorted by a field which is static and never changes.
- The data query must always return the same data.
- The data is loaded in pages of a fixed size.

## Solution proposed by Daniel Draes

One way of loading the data is to sort it by sys_updated_on and walk through the pages by querying the next window with a higher sys_updated_on than the max from the previous window [Link](https://community.servicenow.com/community?id=community_article&sys_id=80ec3bb7db13c890414eeeb5ca961929).

The drawback of this solution is that it can fail in certain situations like:

- all records on one page have the same sys_updated_on (Junk size must be bigger than max. number of records changed per second)
- updated records during the load process move down to the list and cause duplicates (Duplicate records will be returned because of this, use sys_id to coalesce information)

It is stated that the sys_offset function should not be used as it *will lead to missing records*

**But this is only true if the query result is volatile and potentially change during the job.**

## Aggregation Solution

To ensure the query returns always the same results following must be done:

- the order by field is static (sys_created_on)
- the query returns always the same data (sys_updated_on <= max(sys_updated_on))

Implementation:

1. Aggregate max(sys_updated_on)
2. Count total Rows count(sys_id)

## Full load

select count(sys_id), max(sys_updated_on) from table
