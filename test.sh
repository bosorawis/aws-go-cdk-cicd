#!/bin/bash

rm -rf .build
declare -a StringArray=("hello-world")

for val in ${StringArray[@]}; do
    echo "building $val"
    go test ./myapp/$val
done
