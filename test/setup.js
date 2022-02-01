
// cleanup
var gr = new GlideRecord('u_rest_api_acl_test');
gr.query();
gr.deleteMultiple();

// create test records

for (var i = 1; i <= 300; i++) {
    var gr = new GlideRecord('u_rest_api_acl_test');
    gr.u_number = i;
    gr.insert()
}
