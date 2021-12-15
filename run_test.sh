#!/bin/bash

for (( count=1; count<=100; count++ ))
  do
    printf "\nTest %03d: " $count 
    ./test_gen 
    timeout 10 node ./index.js
    rm -f test.trs
    ./test_check
    rm -f result 
  done
echo 
./total_results
rm -f witness.txt pass.txt
sleep 1
