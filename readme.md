# ServiceNow Data Replication done right

* [Problem description](#problem-description)
  * [Drawbacks](#drawbacks)
* [Solution Proposed](#solution-proposed)
  * [Timestamp Problem](#timestamp-problem)
  * [Empty Page Problem](#empty-page-problem)
  * [Multi Threading](#multi-threading)
  * [Rolling end](#rolling-end)
* [Query Sample](#query-sample)
  * [Page 1](#page-1)
  * [Page 2](#page-2)
* [Reference Implementation](#reference-implementation)
  * [Thread and jobs sequence](#thread-and-jobs-sequence)

## Problem description

Loading data correctly from ServiceNow can be challenging if the records in ServiceNow do frequently change, ACL's apply or data is deleted.  

Daniel Draes wrote a [ServiceNow Community article](https://community.servicenow.com/community?id=community_article&sys_id=80ec3bb7db13c890414eeeb5ca961929) about this topic.  
However the solution he proposed has some drawbacks.  

The solution proposed is to sort the records by sys_updated_on and upsert (insert or update) records in the database as they might occur multiple times in the result list (when updated during the run)

### Drawbacks

**multi threading** - multi threading on timestamp requires to have good knowledge of the data and how its spread over the day  
**empty page** - an empty page is **not** an indicator that there is no more data - there is a good chance that there is just an ACL causing an empty page  
**identical timestamp** - there is a risk that all records in a page do have the same timestamp value, in that case the query to the nex page (timestamp > lastrow(timestamp)) will miss some records.  
**rolling end** - if the records are created/updated in high frequency the number of rows exceed the window size and the job never ends

## Solution Proposed

### Timestamp Problem

To solve this problem, additionally sort by `sys_id` and query the next page as following:  
`sys_updated_on == last_page_max(sys_updated_on) && sys_id > last_page_max(sys_id)`

### Empty Page Problem

As an empty page can be caused by ACL, its not an indicator for the last page has reached. Also if the above query is used, there is a certain risk that there are more rows on the next page which can not be reached.  
To solve this problem, always use the NEXT url from the LINK header which contains the same query but a higher `sysparm_offset`

### Multi Threading

To solve this problem, in each thread query for a range of sys_id values. Each thread will query the same pages with a different range like:

1. sys_id<40
2. sys_id>=40^sys_id<80
3. query": "sys_id>=80^sys_id<c0
4. sys_id>=c0

### Rolling end

To solve this problem a threshold must be set after which the load ends. The `x-total-count` header on the first request can be used to calculate the expected number of pages.

## Query Sample

### Page 1

```sql
select 
    *
from 
    table 
order by
    sys_updated_on ASC, sys_id ASC

limit 2000
```

### Page 2

```sql
select 
    *
from 
    table 
where
    case when (there are NO rows on the page) then 
        use the next link from the header
    else
        (sys_updated_on == last_page_max(sys_updated_on) && sys_id > last_page_max(sys_id) )
    end
order by
    sys_updated_on ASC, sys_id ASC

limit 2000
```

## Reference Implementation

### Thread and jobs sequence

- [sample-snapshot-2-tread-with-acl.json](./sample/sample-snapshot-2-tread-with-acl.json)
- [sample-increment-2-tread-with-acl.json.jsonn](./sample/sample-increment-2-tread-with-acl.json.json)

